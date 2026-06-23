<#
.SYNOPSIS
    Build Donut Browser with NSIS installer + portable EXE.
.DESCRIPTION
    Builds both the standalone portable EXE and NSIS setup installer.
    Skips Linux/macOS bundle targets (DEB/RPM/AppImage/DMG) to save time
    over the full cross-platform build.
.PARAMETER SkipProxyPrebuild
    Skip prebuilding donut-proxy binary (use if already built).
.EXAMPLE
    .\build-nsis.ps1
    .\build-nsis.ps1 -SkipProxyPrebuild
#>

param(
    [switch]$SkipProxyPrebuild
)

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $PSScriptRoot
$tauriDir = Join-Path $rootDir "src-tauri"

Write-Host
Write-Host "  =======================================================" -ForegroundColor Cyan
Write-Host "     Donut Browser -- NSIS Installer Build" -ForegroundColor Cyan
Write-Host "  =======================================================" -ForegroundColor Cyan
Write-Host

# -- [1/4] MSVC toolchain -------------------------------------------
Write-Host "  >> [1/4] Setting MSVC toolchain..." -ForegroundColor Yellow
$prevPref = $ErrorActionPreference
$ErrorActionPreference = "Continue"
rustup default stable-x86_64-pc-windows-msvc 2>&1 | Out-Null
$ErrorActionPreference = $prevPref
if ($LASTEXITCODE -ne 0) { throw "Failed to set MSVC toolchain" }
Write-Host "     [OK]" -ForegroundColor Green
Write-Host

# -- [2/4] Proxy binary ----------------------------------------------
if (-not $SkipProxyPrebuild) {
    Write-Host "  >> [2/4] Prebuilding donut-proxy..." -ForegroundColor Yellow
    Push-Location $tauriDir
    try {
        cargo build --bin donut-proxy --release --quiet 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Proxy build failed" }
        Write-Host "     [OK] donut-proxy built" -ForegroundColor Green
    } finally {
        Pop-Location
    }
} else {
    Write-Host "  >> [2/4] Proxy prebuild: skipped" -ForegroundColor Green
}
Write-Host

# -- Stop locked proxy before Tauri copies externalBin --------------
$releaseProxyPath = Join-Path $tauriDir "target\release\donut-proxy.exe"
$lockedProxies = Get-Process donut-proxy -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $releaseProxyPath }
if ($lockedProxies) {
    Write-Host "     [i] Stopping locked proxy PID $($lockedProxies.Id -join ', ')" -ForegroundColor Yellow
    $lockedProxies | Stop-Process -Force -Confirm:$false
    Write-Host
}

# -- [3/4] Tauri build ----------------------------------------------
Write-Host "  >> [3/4] Building Tauri (NSIS installer + EXE)..." -ForegroundColor Yellow
Write-Host

$env:STABLE_RELEASE = "1"

$prevPref2 = $ErrorActionPreference
$ErrorActionPreference = "Continue"
pnpm --prefix $rootDir exec tauri build --bundles nsis 2>&1 | ForEach-Object { Write-Host "$_" }
$ErrorActionPreference = $prevPref2
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }
Write-Host

# -- [4/4] Results --------------------------------------------------
Write-Host "  >> [4/4] Build complete!" -ForegroundColor Cyan
$exePath = Join-Path $tauriDir "target\release\donutbrowser.exe"
$nsisDir = Join-Path $tauriDir "target\release\bundle\nsis"
$nsisPattern = "Donut_*_x64-setup.exe"

if (Test-Path $exePath) {
    $size = (Get-Item $exePath).Length / 1MB
    Write-Host "        Portable EXE: $exePath" -ForegroundColor White
    Write-Host "        Size: $([math]::Round($size, 1)) MB" -ForegroundColor White
}

$nsisSetup = Get-ChildItem -Path $nsisDir -Filter $nsisPattern -ErrorAction SilentlyContinue
if ($nsisSetup) {
    $size = $nsisSetup.Length / 1MB
    Write-Host "        NSIS Setup: $($nsisSetup.FullName)" -ForegroundColor White
    Write-Host "        Size: $([math]::Round($size, 1)) MB" -ForegroundColor White
} else {
    Write-Host "        NSIS Setup: (not found)" -ForegroundColor Red
}
Write-Host
