&lt;#
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

Write-Host "=== Donut Browser — NSIS Installer Build ===" -ForegroundColor Cyan

# Step 1: Switch to MSVC toolchain
Write-Host "[1/4] Setting MSVC toolchain..." -ForegroundColor Yellow
rustup default stable-x86_64-pc-windows-msvc

# Step 2: Prebuild proxy binary (unless skipped)
if (-not $SkipProxyPrebuild) {
    Write-Host "[2/4] Prebuilding donut-proxy binary..." -ForegroundColor Yellow
    Push-Location $tauriDir
    try {
        cargo build --bin donut-proxy --release 2>&1
        if ($LASTEXITCODE -ne 0) { throw "Proxy build failed" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[2/4] Skipping proxy prebuild (using existing binary)" -ForegroundColor Green
}

# Step 3: Build Tauri — NSIS installer + EXE
Write-Host "[3/4] Building Tauri (NSIS installer + EXE)..." -ForegroundColor Yellow

# --bundles app,nsis builds only .exe + NSIS setup, skips DEB/RPM/AppImage/DMG
# Chạy từ project root (không cd src-tauri) — đúng theo skill
pnpm --prefix $rootDir exec tauri build --bundles app,nsis 2>&1
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

# Step 4: Show output
$exePath = Join-Path $tauriDir "target\release\donutbrowser.exe"
$nsisDir = Join-Path $tauriDir "target\release\bundle\nsis"
$nsisPattern = "Donut_*_x64-setup.exe"

Write-Host "[4/4] Done!" -ForegroundColor Cyan

if (Test-Path $exePath) {
    $size = (Get-Item $exePath).Length / 1MB
    Write-Host "      Portable EXE: $exePath" -ForegroundColor White
    Write-Host "      Size: $([math]::Round($size, 1)) MB" -ForegroundColor White
}

$nsisSetup = Get-ChildItem -Path $nsisDir -Filter $nsisPattern -ErrorAction SilentlyContinue
if ($nsisSetup) {
    $size = $nsisSetup.Length / 1MB
    Write-Host "      NSIS Setup: $($nsisSetup.FullName)" -ForegroundColor White
    Write-Host "      Size: $([math]::Round($size, 1)) MB" -ForegroundColor White
} else {
    Write-Host "      NSIS Setup: (not found in $nsisDir)" -ForegroundColor Red
}
