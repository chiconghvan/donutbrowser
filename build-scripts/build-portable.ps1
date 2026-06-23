<#
.SYNOPSIS
    Build Donut Browser portable EXE only -- fastest build.
.DESCRIPTION
    Builds only the standalone portable executable, skipping all installers
    (NSIS/DEB/RPM/AppImage/DMG). Saves ~7-13 min over full build.
.PARAMETER SkipProxyPrebuild
    Skip prebuilding donut-proxy binary (use if already built).
.EXAMPLE
    .\build-portable.ps1
    .\build-portable.ps1 -SkipProxyPrebuild
#>

param(
    [switch]$SkipProxyPrebuild
)

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $PSScriptRoot
$tauriDir = Join-Path $rootDir "src-tauri"

Write-Host
Write-Host "  =======================================================" -ForegroundColor Cyan
Write-Host "     Donut Browser -- Portable EXE Build" -ForegroundColor Cyan
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
Write-Host "  >> [3/4] Building Tauri (portable EXE only)..." -ForegroundColor Yellow
Write-Host

$env:STABLE_RELEASE = "1"

$prevPref2 = $ErrorActionPreference
$ErrorActionPreference = "Continue"
pnpm --prefix $rootDir exec tauri build --no-bundle 2>&1 | ForEach-Object { Write-Host "$_" }
$ErrorActionPreference = $prevPref2
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }
Write-Host

# -- [4/4] Results --------------------------------------------------
Write-Host "  >> [4/4] Build complete!" -ForegroundColor Cyan

$exePath = Join-Path $tauriDir "target\release\donutbrowser.exe"
if (Test-Path $exePath) {
    $size = (Get-Item $exePath).Length / 1MB
    Write-Host "        Portable EXE: $exePath" -ForegroundColor White
    Write-Host "        Size: $([math]::Round($size, 1)) MB" -ForegroundColor White
} else {
    Write-Host "        WARNING: EXE not found!" -ForegroundColor Red
    exit 1
}
Write-Host
