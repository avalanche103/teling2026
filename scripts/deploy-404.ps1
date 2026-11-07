# Proven pattern from deploy.ps1: short SSH, schedule nohup build/restart.
# Single session upload to avoid MaxStartups dropping a 2nd connection.
param(
    [string]$HostName = "134.17.16.134",
    [int]$Port = 22,
    [string]$User = "user",
    [string]$RemotePath = "/opt/teling",
    [string]$IdentityFile = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LocalFile = Join-Path $ProjectRoot "app\not-found.tsx"
$SshTarget = "${User}@${HostName}"
$DefaultKeyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519_teling"
$KeyPath = if ($IdentityFile) { $IdentityFile } elseif (Test-Path $DefaultKeyPath) { $DefaultKeyPath } else { $null }

if (-not (Test-Path $LocalFile)) { throw "Missing $LocalFile" }
if (-not $KeyPath) { throw "SSH key not found at $DefaultKeyPath" }

$sshOpts = @(
    "-p", "$Port",
    "-i", $KeyPath,
    "-o", "IdentitiesOnly=yes",
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=25",
    "-o", "ServerAliveInterval=20",
    "-o", "ServerAliveCountMax=6",
    "-o", "StrictHostKeyChecking=accept-new"
)

function Wait-SshReady {
    for ($i = 1; $i -le 8; $i++) {
        Write-Host "[*] SSH probe ${i}/8..."
        & ssh @sshOpts $SshTarget "echo READY"
        if ($LASTEXITCODE -eq 0) {
            Start-Sleep -Seconds 8
            return
        }
        Start-Sleep -Seconds 20
    }
    throw "SSH key login is not stable right now"
}

Wait-SshReady

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($LocalFile))

# Single-quoted here-string so PowerShell does not expand $(date) etc.
$remoteScript = @'
set -e
python3 - <<'PY'
import base64, pathlib
data = """__B64__"""
path = pathlib.Path("/opt/teling/app/not-found.tsx")
bak = path.with_suffix(".tsx.bak")
if path.exists():
    bak.write_bytes(path.read_bytes())
path.write_bytes(base64.b64decode(data))
print("uploaded", path, "bytes", path.stat().st_size)
PY

cat > /tmp/teling-deploy-404.sh << 'EOF'
#!/bin/bash
set -e
cd /opt/teling
export NODE_OPTIONS="--max-old-space-size=768"
echo "[*] build start $(date -u)" > /tmp/teling-deploy-404.log
npm run build >> /tmp/teling-deploy-404.log 2>&1
ss -ltnp 2>/dev/null | grep ":10024" | sed -n "s/.*pid=\([0-9]*\).*/\1/p" | xargs -r kill 2>/dev/null || true
pkill -f "scripts/start-next.cjs" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 2
nohup /usr/bin/node scripts/start-next.cjs > next-only.log 2>&1 </dev/null &
sleep 5
ss -ltnp 2>/dev/null | grep 10024 >> /tmp/teling-deploy-404.log || true
curl -sI http://127.0.0.1:10024/missing-test | head -n 12 >> /tmp/teling-deploy-404.log || true
echo "[*] done $(date -u)" >> /tmp/teling-deploy-404.log
EOF
sed -i "s/\r$//" /tmp/teling-deploy-404.sh
chmod +x /tmp/teling-deploy-404.sh
nohup bash /tmp/teling-deploy-404.sh >/tmp/teling-deploy-404.nohup 2>&1 </dev/null &
echo scheduled
'@

$remoteScript = $remoteScript.Replace("__B64__", $b64)

Write-Host "[*] Uploading + scheduling build in ONE ssh session..."
$remoteScript | & ssh @sshOpts $SshTarget "bash -s"
if ($LASTEXITCODE -ne 0) { throw "Remote schedule failed" }

Write-Host "[*] Scheduled. Polling public URL for HTTP 404..."
$ok = $false
for ($i = 1; $i -le 60; $i++) {
    Start-Sleep -Seconds 15
    $headers = & curl.exe -sI --max-time 20 "https://teling.by/missing-test-404-deploy" 2>$null
    $line = @($headers | Select-Object -First 1) -join ""
    Write-Host "[*] probe ${i}: $line"
    if ($line -match " 404") { $ok = $true; break }
}

if (-not $ok) {
    Write-Host "[!] Not confirmed yet. Fetching remote log via SSH..."
    Start-Sleep -Seconds 10
    & ssh @sshOpts $SshTarget "tail -n 60 /tmp/teling-deploy-404.log || tail -n 60 /tmp/teling-deploy-404.nohup || true"
    throw "Public 404 not confirmed"
}

Write-Host "[*] Success - missing pages return 404 on https://teling.by"
