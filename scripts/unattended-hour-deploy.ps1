param(
    [string]$HostName = "134.17.16.134",
    [int]$Port = 22,
    [string]$User = "user",
    [string]$RemotePath = "/opt/teling",
    [string]$IdentityFile = ""
)

# Unattended: ATEN images + recent SSD images + facet perf fix + production rebuild.
# Authorized in advance by user for a timed run (no interactive confirmations expected).

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$SshTarget = "${User}@${HostName}"
$DefaultKeyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519_teling"
$KeyPath = if ($IdentityFile) { $IdentityFile } elseif (Test-Path $DefaultKeyPath) { $DefaultKeyPath } else { $null }
if (-not $KeyPath) { throw "SSH key missing" }

$AtenArchive = Join-Path $env:TEMP "teling-aten-images.tar.gz"
$RecentArchive = Join-Path $env:TEMP "teling-recent-images.tar.gz"
$Cutoff = Get-Date "2026-11-18 21:00:00"

function Get-SshOpts {
    param([ValidateSet("ssh", "scp")][string]$Tool = "ssh")
    $portFlag = if ($Tool -eq "scp") { "-P" } else { "-p" }
    return @(
        $portFlag, "$Port",
        "-i", $KeyPath,
        "-o", "IdentitiesOnly=yes",
        "-o", "BatchMode=yes",
        "-o", "ConnectTimeout=30",
        "-o", "ServerAliveInterval=20",
        "-o", "ServerAliveCountMax=6"
    )
}

function Wait-Ssh {
    for ($i = 1; $i -le 12; $i++) {
        Write-Host "[*] SSH probe $i/12..."
        & ssh @(Get-SshOpts) $SshTarget "echo READY"
        if ($LASTEXITCODE -eq 0) {
            Start-Sleep -Seconds 10
            return
        }
        Start-Sleep -Seconds 25
    }
    throw "SSH not ready"
}

function Invoke-RemoteBash([string]$Bash) {
    $Bash = ($Bash -replace "`r`n", "`n" -replace "`r", "")
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Bash))
    & ssh @(Get-SshOpts) $SshTarget "echo $b64 | base64 -d > /tmp/teling-unattended.sh && bash /tmp/teling-unattended.sh"
    if ($LASTEXITCODE -ne 0) { throw "remote bash failed: $LASTEXITCODE" }
}

Write-Host "=== 1) Ensure ATEN archive ==="
$atenFiles = Get-ChildItem (Join-Path $ProjectRoot "public\images") -File -Filter "910000-*" -ErrorAction SilentlyContinue
if (-not $atenFiles -or $atenFiles.Count -lt 1) { throw "No local 910000-* images" }
if (-not (Test-Path $AtenArchive) -or ((Get-Item $AtenArchive).Length -lt 1MB)) {
    $list = Join-Path $env:TEMP "aten-images.list"
    $atenFiles | ForEach-Object { $_.Name } | Set-Content -Encoding ascii $list
    Push-Location (Join-Path $ProjectRoot "public\images")
    try {
        & tar -czf $AtenArchive -T $list
        if ($LASTEXITCODE -ne 0) { throw "aten tar failed" }
    } finally { Pop-Location }
}
Write-Host ("ATEN archive: {0:N1} MB ({1} files)" -f ((Get-Item $AtenArchive).Length / 1MB), $atenFiles.Count)

Write-Host "=== 2) Pack recent non-ATEN images (since $Cutoff) ==="
$recent = Get-ChildItem (Join-Path $ProjectRoot "public\images") -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "910000-*" -and $_.LastWriteTime -ge $Cutoff }
$doRecent = $false
if ($recent -and $recent.Count -gt 0) {
    $list2 = Join-Path $env:TEMP "recent-images.list"
    $recent | ForEach-Object { $_.Name } | Set-Content -Encoding ascii $list2
    if (Test-Path $RecentArchive) { Remove-Item $RecentArchive -Force }
    Push-Location (Join-Path $ProjectRoot "public\images")
    try {
        & tar -czf $RecentArchive -T $list2
        if ($LASTEXITCODE -ne 0) { throw "recent tar failed" }
    } finally { Pop-Location }
    $doRecent = $true
    Write-Host ("Recent archive: {0:N1} MB ({1} files)" -f ((Get-Item $RecentArchive).Length / 1MB), $recent.Count)
} else {
    Write-Host "No recent non-ATEN images to sync."
}

Wait-Ssh

Write-Host "=== 3) Upload ATEN archive ==="
& scp @(Get-SshOpts -Tool scp) $AtenArchive "${SshTarget}:/tmp/teling-aten-images.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "ATEN scp failed" }
Start-Sleep -Seconds 10

if ($doRecent) {
    Write-Host "=== 4) Upload recent SSD images ==="
    & scp @(Get-SshOpts -Tool scp) $RecentArchive "${SshTarget}:/tmp/teling-recent-images.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "recent scp failed" }
    Start-Sleep -Seconds 10
}

Write-Host "=== 5) Upload facet fix sources ==="
& scp @(Get-SshOpts -Tool scp) (Join-Path $ProjectRoot "lib\data.ts") "${SshTarget}:${RemotePath}/lib/data.ts"
if ($LASTEXITCODE -ne 0) { throw "data.ts scp failed" }
Start-Sleep -Seconds 8
& scp @(Get-SshOpts -Tool scp) (Join-Path $ProjectRoot "app\(site)\catalog\[slug]\page.tsx") "${SshTarget}:${RemotePath}/app/(site)/catalog/[slug]/page.tsx"
if ($LASTEXITCODE -ne 0) { throw "page.tsx scp failed" }
Start-Sleep -Seconds 10

Write-Host "=== 6) Extract images + rebuild ==="
$recentCmd = if ($doRecent) {
    @"
tar -xzf /tmp/teling-recent-images.tar.gz -C '$RemotePath/public/images'
rm -f /tmp/teling-recent-images.tar.gz
echo -n RECENT_DONE=
ls '$RemotePath/public/images' | wc -l
"@
} else { "echo NO_RECENT" }

$bash = @"
set -e
cd '$RemotePath'
mkdir -p public/images
ls -lh /tmp/teling-aten-images.tar.gz
tar -xzf /tmp/teling-aten-images.tar.gz -C public/images
rm -f /tmp/teling-aten-images.tar.gz
echo -n ATEN_FILES=
ls public/images/910000-* 2>/dev/null | wc -l
$recentCmd
grep -n hasMeaningfulActiveFilters lib/data.ts | head -3
grep -n 'hasActiveFilters(effectiveFilters)' 'app/(site)/catalog/[slug]/page.tsx' | head -3
ss -ltnp 2>/dev/null | grep ':10024' | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | xargs -r kill 2>/dev/null || true
pkill -f 'scripts/start-next.cjs' 2>/dev/null || true
pkill -f 'next-server' 2>/dev/null || true
sleep 2
nohup bash start-production.sh >> deploy.log 2>&1 </dev/null &
echo SCHEDULED `$!
sleep 6
tail -n 40 deploy.log || true
ps aux | grep -E 'start-production|npm run build|next' | grep -v grep | head -12 || true
df -h / | tail -1
"@

Invoke-RemoteBash $bash

Write-Host "=== Done. Build runs in background via start-production.sh ==="
Write-Host "Verify later: https://teling.by/images/910000-00386_1.webp and /catalog/kommutatory"
