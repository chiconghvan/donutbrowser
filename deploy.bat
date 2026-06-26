@echo off
setlocal EnableExtensions EnableDelayedExpansion

pushd "%~dp0"

for /f "delims=" %%I in ('powershell -NoProfile -Command "(Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version"') do set "VERSION=%%I"
if not defined VERSION (
  echo Failed to read version from package.json
  popd
  exit /b 1
)

for /f "delims=" %%I in ('git branch --show-current') do set "BRANCH=%%I"
if not defined BRANCH (
  echo Failed to detect the current branch
  popd
  exit /b 1
)

set "RELEASE_TAG=v%VERSION%"
set "NOTES_FILE=%TEMP%\donutbrowser-release-notes-%VERSION%.md"
set "TAG_COMMIT="
set "HEAD_COMMIT="

powershell -NoProfile -Command ^
  "$version = '%VERSION%';" ^
  "$releaseTag = 'v%VERSION%';" ^
  "$raw = Get-Content -LiteralPath 'CHANGELOG.md' -Raw;" ^
  "$pattern = '(?ms)^##\s+' + [regex]::Escape($releaseTag) + '.*\r?\n(?<body>.*?)(?=^##\s+|\z)';" ^
  "$match = [regex]::Match($raw, $pattern);" ^
  "if (-not $match.Success) { throw \"Missing changelog section for version $releaseTag\" }" ^
  "$body = $match.Groups['body'].Value.Trim();" ^
  "$notes = \"## $releaseTag`r`n`r`n$body`r`n\";" ^
  "Set-Content -LiteralPath '%NOTES_FILE%' -Value $notes -NoNewline"
if errorlevel 1 (
  echo Failed to extract changelog notes
  popd
  exit /b 1
)

git add -A

git diff --cached --quiet
set "DIFF_STATUS=%ERRORLEVEL%"
if "%DIFF_STATUS%"=="1" (
  git commit --no-verify -m "release: v%VERSION%"
  if errorlevel 1 (
    echo Commit failed
    popd
    exit /b 1
  )
) else if not "%DIFF_STATUS%"=="0" (
  echo Failed to inspect staged changes
  popd
  exit /b 1
) else (
  echo No changes to commit, skipping commit
)

git rev-parse -q --verify "refs/tags/%RELEASE_TAG%" >nul 2>&1
if errorlevel 1 (
  git tag -a "v%VERSION%" -m "v%VERSION%"
  if errorlevel 1 (
    echo Tag creation failed
    popd
    exit /b 1
  )
) else (
  for /f "delims=" %%I in ('git rev-list -n 1 "%RELEASE_TAG%"') do set "TAG_COMMIT=%%I"
  for /f "delims=" %%I in ('git rev-parse HEAD') do set "HEAD_COMMIT=%%I"
  if /I "!TAG_COMMIT!"=="!HEAD_COMMIT!" (
    echo Tag %RELEASE_TAG% already exists on this commit, skipping tag creation
  ) else (
    echo Tag %RELEASE_TAG% exists but points to a different commit
    popd
    exit /b 1
  )
)

git push origin "%BRANCH%" --tags
if errorlevel 1 (
  echo Push failed
  popd
  exit /b 1
)

gh release view "%RELEASE_TAG%" >nul 2>&1
if errorlevel 1 (
  gh release create "%RELEASE_TAG%" --title "%RELEASE_TAG%" --notes-file "%NOTES_FILE%" --latest
) else (
  gh release edit "%RELEASE_TAG%" --title "%RELEASE_TAG%" --notes-file "%NOTES_FILE%"
)

if errorlevel 1 (
  echo GitHub release create/edit failed
  popd
  exit /b 1
)

del /q "%NOTES_FILE%" >nul 2>&1

popd
exit /b 0
