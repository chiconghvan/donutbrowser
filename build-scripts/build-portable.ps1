&lt;#
.SYNOPSIS
    Build Donut Browser portable EXE only — fastest build.
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

Write-Host "=== Donut Browser — Portable EXE Build ===" -ForegroundColor Cyan

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

# Step 3: Build Tauri — portable EXE only
Write-Host "[3/4] Building Tauri (portable EXE only)..." -ForegroundColor Yellow

# --bundles app overrides tauri.conf.json targets to build only the .exe
# Chạy từ project root (không cd src-tauri) — đúng theo skill
pnpm --prefix $rootDir exec tauri build --bundles app 2>&1
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

# Step 4: Show output
$exePath = Join-Path $tauriDir "target\release\donutbrowser.exe"
if (Test-Path $exePath) {
    $size = (Get-Item $exePath).Length / 1MB
    Write-Host "[4/4] Done! Portable EXE:" -ForegroundColor Cyan
    Write-Host "      $exePath" -ForegroundColor White
    Write-Host "      Size: $([math]::Round($size, 1)) MB" -ForegroundColor White
} else {
    Write-Host "[4/4] WARNING: EXE not found at expected path!" -ForegroundColor Red
    exit 1
}
