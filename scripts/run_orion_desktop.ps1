Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RootDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DesktopDir = Join-Path $RootDir "desktop"

if (-not (Test-Path (Join-Path $DesktopDir "package.json"))) {
  Write-Error "desktop/package.json not found."
}

Push-Location $DesktopDir
try {
  if (-not (Test-Path (Join-Path $DesktopDir "node_modules/electron"))) {
    Write-Host "[setup] Installing desktop dependencies..."
    npm install
  }

  Write-Host "[run] Launching Empyralis Workbench desktop..."
  npm run dev
} finally {
  Pop-Location
}
