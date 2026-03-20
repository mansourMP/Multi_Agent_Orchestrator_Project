param(
  [ValidateSet("auto", "mac", "win", "linux", "all", "dir")]
  [string]$Target = "auto"
)

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

  if ($Target -eq "auto") {
    if ($IsWindows) {
      $Target = "win"
    } elseif ($IsMacOS) {
      $Target = "mac"
    } elseif ($IsLinux) {
      $Target = "linux"
    } else {
      throw "Unknown platform. Use one of: mac, win, linux, all, dir."
    }
  }

  Write-Host "[build] Empyralis desktop target: $Target"
  switch ($Target) {
    "mac"   { npm run pack:mac }
    "win"   { npm run pack:win }
    "linux" { npm run pack:linux }
    "all"   { npm run pack:all }
    "dir"   { npm run pack:dir }
    default { throw "Invalid target: $Target" }
  }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "Build output:"
Write-Host "  $DesktopDir/dist"
