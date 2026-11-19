param(
    [switch]$SkipBuild
)

# Pack a deploy-ready archive without uploading.
# Output: _backups/teling-deploy-ready.tar.gz
# Upload later: .\scripts\upload-prepared-deploy.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BackupDir = Join-Path $ProjectRoot "_backups"
$Archive = Join-Path $BackupDir "teling-deploy-ready.tar.gz"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

if (-not $SkipBuild) {
    Write-Host "[*] Local production build (verify)..."
    Push-Location $ProjectRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed: $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
}

if (Test-Path $Archive) { Remove-Item $Archive -Force }

Write-Host "[*] Packing $Archive ..."
Push-Location $ProjectRoot
try {
    & tar -czf $Archive `
        --exclude=node_modules `
        --exclude=.git `
        --exclude=.next-dev `
        --exclude=.next `
        --exclude=public/images `
        --exclude=_backups `
        --exclude=NUL `
        --exclude=ssd-admin-app/export `
        --exclude=ssd-admin-app/__pycache__ `
        --exclude=ssd-admin-app/*.db `
        --exclude=.vscode `
        .
    if ($LASTEXITCODE -ne 0) { throw "tar failed: $LASTEXITCODE" }
} finally {
    Pop-Location
}

$item = Get-Item $Archive
$mb = [math]::Round(($item.Length / 1MB), 1)
Write-Host "[*] Ready: $($item.FullName) (~${mb} MB)"
Write-Host "    When SSH is up: .\scripts\upload-prepared-deploy.ps1"
Write-Host "    (images already on VPS; this archive excludes public/images)"
