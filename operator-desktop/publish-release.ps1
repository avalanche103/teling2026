# Publish Teling Chat installers to GitHub Releases (tag operator-v{version}).
# Prerequisites: gh auth login; NSIS/MSI already built (.\build.ps1).
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) {
  Write-Error "GitHub CLI (gh) not found. Install: winget install --id GitHub.cli"
}

$confPath = Join-Path $root "src-tauri\tauri.conf.json"
if (-not (Test-Path $confPath)) {
  Write-Error "Missing $confPath"
}
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$version = $conf.version
if (-not $version) {
  Write-Error "version not found in tauri.conf.json"
}

$productName = $conf.productName
if (-not $productName) { $productName = "Teling Chat" }

$tag = "operator-v$version"
$distDir = Join-Path $root "dist"
$bundleNsis = Join-Path $root "src-tauri\target\release\bundle\nsis"
$bundleMsi = Join-Path $root "src-tauri\target\release\bundle\msi"

if (-not (Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}

$nsisName = "${productName}_${version}_x64-setup.exe"
$msiName = "${productName}_${version}_x64_en-US.msi"
$nsisDist = Join-Path $distDir $nsisName
$msiDist = Join-Path $distDir $msiName

function Ensure-Asset([string]$dest, [string]$bundleDir, [string]$fileName) {
  if (Test-Path $dest) { return }
  $src = Join-Path $bundleDir $fileName
  if (Test-Path $src) {
    Copy-Item $src $dest -Force
    Write-Host "Copied $fileName -> dist/"
    return
  }
  Write-Error "Missing installer: $dest (and not found at $src). Run .\build.ps1 first."
}

Ensure-Asset $nsisDist $bundleNsis $nsisName
Ensure-Asset $msiDist $bundleMsi $msiName

$existing = gh release view $tag --repo avalanche103/teling2026 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "Release $tag already exists. Uploading/replacing assets..."
  gh release upload $tag $nsisDist $msiDist --repo avalanche103/teling2026 --clobber
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  $notes = @"
Desktop operator client for teling.by.

- Install the NSIS setup (``*_x64-setup.exe``) on Windows 10/11 office PCs.
- MSI is also attached for managed installs.
"@
  gh release create $tag $nsisDist $msiDist `
    --repo avalanche103/teling2026 `
    --title "Teling Chat $version" `
    --notes $notes
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ""
Write-Host "Published $tag"
Write-Host "https://github.com/avalanche103/teling2026/releases/tag/$tag"
Write-Host "Latest: https://github.com/avalanche103/teling2026/releases/latest"
