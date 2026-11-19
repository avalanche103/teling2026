param(
    [string]$HostName = "134.17.16.134",
    [int]$Port = 22,
    [string]$User = "user",
    [string]$RemotePath = "/opt/teling",
    [string]$IdentityFile = "",
    [string]$ArchivePath = ""
)

# Upload a previously packed deploy archive (no local rebuild/repack).
# Prep: .\scripts\prepare-deploy.ps1
# Then when SSH is up: .\scripts\upload-prepared-deploy.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SshTarget = "${User}@${HostName}"
$DefaultKeyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519_teling"
$DefaultArchive = Join-Path $ProjectRoot "_backups\teling-deploy-ready.tar.gz"
$Archive = if ($ArchivePath) { $ArchivePath } else { $DefaultArchive }

function Get-TransportOpts {
    param([ValidateSet("ssh", "scp")][string]$Tool = "ssh")
    $portFlag = if ($Tool -eq "scp") { "-P" } else { "-p" }
    $opts = @($portFlag, "$Port", "-o", "ConnectTimeout=25", "-o", "ServerAliveInterval=20", "-o", "ServerAliveCountMax=6")
    $keyPath = if ($IdentityFile) { $IdentityFile } elseif (Test-Path $DefaultKeyPath) { $DefaultKeyPath } else { $null }
    if ($keyPath) {
        $opts += @("-i", $keyPath, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes")
    }
    return $opts
}

if (-not (Test-Path $Archive)) {
    throw "Archive missing: $Archive — run .\scripts\prepare-deploy.ps1 first"
}

$mb = [math]::Round(((Get-Item $Archive).Length / 1MB), 1)
Write-Host "Archive: $Archive (~${mb} MB)"
Write-Host "Target: ${SshTarget}:${RemotePath}"

Write-Host "[*] SSH probe..."
& ssh @(Get-TransportOpts) $SshTarget "echo READY; df -h / | tail -1"
if ($LASTEXITCODE -ne 0) { throw "SSH not ready" }
Start-Sleep -Seconds 8

Write-Host "[*] Uploading..."
& scp @(Get-TransportOpts -Tool scp) $Archive "${SshTarget}:/tmp/teling2026-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp failed: $LASTEXITCODE" }
Start-Sleep -Seconds 8

Write-Host "[*] Extract + schedule production restart..."
$remote = @"
set -e
mkdir -p '$RemotePath'
cd '$RemotePath'
tar -xzf /tmp/teling2026-deploy.tar.gz
rm -f /tmp/teling2026-deploy.tar.gz
sed -i 's/\r`$//' start-production.sh scripts/*.cjs 2>/dev/null || true
chmod +x start-production.sh
ss -ltnp 2>/dev/null | grep ':10024' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | xargs -r kill 2>/dev/null || true
ss -ltnp 2>/dev/null | grep ':5050' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | xargs -r kill 2>/dev/null || true
sleep 2
ss -ltnp 2>/dev/null | grep -q ':5050' || (cd '$RemotePath/ssd-admin-app' && SSD_ADMIN_APP_PORT=5050 nohup .venv/bin/python app.py >> flask.log 2>&1 </dev/null &)
nohup bash start-production.sh > deploy.log 2>&1 </dev/null &
sleep 3
echo scheduled
tail -n 15 deploy.log || true
"@
$remote = ($remote -replace "`r`n", "`n" -replace "`r", "")
& ssh @(Get-TransportOpts) $SshTarget $remote
if ($LASTEXITCODE -ne 0) { throw "remote restart failed: $LASTEXITCODE" }

Write-Host "[*] Uploaded. Server is rebuilding via start-production.sh (watch deploy.log)."
Write-Host "    After boot: https://teling.by/product/120905-00130 should show only /images/ (no ssd gallery mix)."
