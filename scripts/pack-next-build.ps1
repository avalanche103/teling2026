param(
    [string]$OutFile = ""
)

# Pack local .next for VPS upload (no server build).
# Upload: python .\scripts\upload-next-build.py

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$NextDir = Join-Path $ProjectRoot ".next"
$DefaultOut = Join-Path $env:TEMP "teling-next-build.tar.gz"
$Archive = if ($OutFile) { $OutFile } else { $DefaultOut }

if (-not (Test-Path (Join-Path $NextDir "BUILD_ID"))) {
    throw ".next/BUILD_ID missing — run npm run build first"
}

if (Test-Path $Archive) { Remove-Item $Archive -Force }

Write-Host "[*] Packing $Archive from $NextDir ..."
Push-Location $ProjectRoot
try {
    & tar -czf $Archive .next
    if ($LASTEXITCODE -ne 0) { throw "tar failed: $LASTEXITCODE" }
} finally {
    Pop-Location
}

$buildId = (Get-Content (Join-Path $NextDir "BUILD_ID") -Raw).Trim()
$mb = [math]::Round(((Get-Item $Archive).Length / 1MB), 1)
Write-Host "[*] Ready: $Archive (~${mb} MB) BUILD_ID=$buildId"
Write-Host "    Upload: set NEXT_TAR and run python .\scripts\upload-next-build.py"
