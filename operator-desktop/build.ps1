# Build Teling Chat installer with MSVC environment.
$ErrorActionPreference = "Stop"
$vcvars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if (-not (Test-Path $vcvars)) {
  $vcvars = "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
}
if (-not (Test-Path $vcvars)) {
  Write-Error "vcvars64.bat not found. Install Visual Studio Build Tools with C++ workload."
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

cmd /c "`"$vcvars`" && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && npm run build"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$bundle = Join-Path $env:CARGO_TARGET_DIR "release\bundle"
if (-not $bundle -or -not (Test-Path $bundle)) {
  $candidates = @(
    (Join-Path $root "src-tauri\target\release\bundle"),
    (Join-Path $env:LOCALAPPDATA "Temp")
  )
  Write-Host "Build finished. Look for NSIS/MSI under src-tauri\target\release\bundle (or Cargo target dir)."
} else {
  Write-Host "Bundles: $bundle"
}
