Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DesktopDir = Join-Path $RootDir "desktop"

if (-not (Test-Path (Join-Path $DesktopDir "package.json"))) {
  Write-Error "desktop/package.json not found."
}

Write-Host "[setup] Installing Empyralis desktop dependencies..."
Push-Location $DesktopDir
try {
  npm install
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Desktop dependencies installed."
Write-Host "Run:"
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/run_empyralis_desktop.ps1"
