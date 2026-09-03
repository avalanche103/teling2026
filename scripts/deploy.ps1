param(
    [string]$HostName = "134.17.16.134",
    [int]$Port = 22,
    [string]$User = "user",
    [string]$RemotePath = "",
    [string]$IdentityFile = "",
    [switch]$DiscoverOnly,
    [switch]$InspectOnly,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$MetPayRoot = if ($env:METPAY_ROOT) { Resolve-Path $env:METPAY_ROOT } else { Resolve-Path "H:\MetPay" }
$DefaultRemotePath = "/opt/teling"
$DefaultMetPayRemotePath = "/opt/teling/metpay"
$SshTarget = "${User}@${HostName}"
$DefaultKeyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519_teling"

function Get-TransportOpts {
    param([ValidateSet("ssh", "scp")][string]$Tool = "ssh")
    $portFlag = if ($Tool -eq "scp") { "-P" } else { "-p" }
    $opts = @($portFlag, "$Port")
    $keyPath = if ($IdentityFile) { $IdentityFile } elseif (Test-Path $DefaultKeyPath) { $DefaultKeyPath } else { $null }
    if ($keyPath) {
        $opts += @("-i", $keyPath, "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes")
    } else {
        $opts += @("-o", "PreferredAuthentications=password", "-o", "PubkeyAuthentication=no")
    }
    return $opts
}

$LikelyRemotePaths = @(
    "/opt/teling",
    "/var/www/$User/data/www/teling.by",
    "/var/www/$User/data/www/teling.by/teling2026",
    "/home/$User/teling2026",
    "/home/$User/www/teling.by",
    "/home/$User/domains/teling.by",
    "/var/www/teling.by",
    "/var/www/html/teling2026"
)

function Invoke-SshCommand {
    param([string]$Command)
    $output = & ssh @(Get-TransportOpts) $SshTarget $Command 2>&1
    if ($LASTEXITCODE -ne 0) {
        if ($output) {
            $output | ForEach-Object { Write-Host $_ }
        }
        throw "SSH command failed with exit code $LASTEXITCODE"
    }
    if ($output) {
        $output | ForEach-Object { Write-Host $_ }
    }
}

function Invoke-SshOutput {
    param(
        [string]$Command,
        [switch]$AllowFailure
    )
    $output = & ssh @(Get-TransportOpts) $SshTarget $Command 2>&1
    if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
        throw "SSH command failed with exit code $LASTEXITCODE"
    }
    return @($output | ForEach-Object { "$_" } | Where-Object { $_.Trim() })
}

function Add-CandidatePath {
    param(
        [System.Collections.Generic.List[string]]$Candidates,
        [string]$Path
    )
    if (-not $Path) { return }
    $normalized = $Path.Trim()
    if (-not $normalized) { return }
    if ($normalized -like '*/start-production.sh') {
        $normalized = $normalized -replace '/start-production\.sh$', ''
    }
    if ($normalized -like '*/package.json') {
        $normalized = Split-Path $normalized -Parent
    }
    if ($normalized -like '*/next.config.ts') {
        $normalized = Split-Path $normalized -Parent
    }
    if ($normalized -like '*/data/products.json') {
        $normalized = Split-Path (Split-Path $normalized -Parent) -Parent
    }
    if ($Candidates -notcontains $normalized) {
        $Candidates.Add($normalized)
    }
}

function Test-RemoteProjectPath {
    param([string]$Path)
    $escaped = $Path.Replace("'", "'\''")
    $cmd = 'test -f ''' + $escaped + '/package.json'' -o -f ''' + $escaped + '/next.config.ts'' -o -f ''' + $escaped + '/data/products.json'''
    $null = Invoke-SshOutput -Command $cmd -AllowFailure
    return $LASTEXITCODE -eq 0
}

function Show-ServerInspect {
    Write-Host "[*] Server inspect: $SshTarget (port $Port)"

    $inspectScript = @'
echo "=== identity ==="
whoami; pwd; ls -la ~
echo "=== start_production ==="
find /opt /home /var/www -maxdepth 6 -name start-production.sh 2>/dev/null | head -n 10
echo "=== next_config ==="
find /opt /home /var/www -maxdepth 6 -name next.config.ts 2>/dev/null | head -n 10
echo "=== package_json ==="
find /opt /home /var/www -maxdepth 4 -name package.json 2>/dev/null | grep -v node_modules | head -n 10
echo "=== port_10024 ==="
ss -ltnp 2>/dev/null | grep 10024 || netstat -ltnp 2>/dev/null | grep 10024 || true
echo "=== next_process ==="
ps aux | grep next | grep -v grep || true
'@ -replace "`r`n", "; " -replace "`n", "; "

    $lines = Invoke-SshOutput -Command $inspectScript
    $lines | ForEach-Object { Write-Host $_ }

    Write-Host ""
    Write-Host "Deploy command:"
    Write-Host "  .\scripts\deploy.ps1 -RemotePath '/opt/teling'"
}

function Resolve-RemotePath {
    if ($RemotePath) {
        if (-not (Test-RemoteProjectPath -Path $RemotePath)) {
            Write-Host "[!] Warning: $RemotePath does not look like project root, continuing anyway."
        }
        return $RemotePath
    }

    Write-Host "[*] Searching project on server $SshTarget ..."

    foreach ($path in $LikelyRemotePaths) {
        if (Test-RemoteProjectPath -Path $path) {
            Write-Host "[*] Project directory: $path"
            return $path
        }
    }

    $searchCmd = @(
        'find /opt /home /var/www -maxdepth 10 -name start-production.sh 2>/dev/null'
        'find /opt /home /var/www -maxdepth 10 -name next.config.ts 2>/dev/null'
        'find /opt /home /var/www -maxdepth 10 -path "*/data/products.json" 2>/dev/null'
        'grep -RIl teling_scaffold /opt /home /var/www 2>/dev/null'
        'for pid in $(pgrep -f next 2>/dev/null); do readlink -f /proc/$pid/cwd; done 2>/dev/null'
    ) -join '; '

    $found = Invoke-SshOutput -Command ($searchCmd + ' | head -n 30') -AllowFailure
    $candidates = New-Object System.Collections.Generic.List[string]

    foreach ($line in $found) {
        Add-CandidatePath -Candidates $candidates -Path $line.Trim()
    }

    $verified = @()
    foreach ($candidate in $candidates) {
        if (Test-RemoteProjectPath -Path $candidate) {
            $verified += $candidate
        }
    }

    $unique = $verified | Select-Object -Unique
    if ($unique.Count -eq 1) {
        Write-Host "[*] Project directory: $($unique[0])"
        return $unique[0]
    }

    if ($unique.Count -gt 1) {
        Write-Host "[!] Found multiple project directories:"
        $unique | ForEach-Object { Write-Host "  - $_" }
        throw "Specify one path: .\scripts\deploy.ps1 -RemotePath '/path/to/project'"
    }

    Write-Host "[!] Auto-discovery failed, but project may still exist."
    Write-Host "    Run: .\scripts\deploy.ps1 -InspectOnly"
    Write-Host "    Then deploy with explicit path, for example:"
    foreach ($path in $LikelyRemotePaths) {
        Write-Host "      .\scripts\deploy.ps1 -RemotePath '$path'"
    }
    throw "Project directory not found automatically"
}

function Get-RemoteDeployCommand {
    param([string]$Target)
    $escaped = $Target.Replace("'", "'\''")
    $metpayEscaped = $DefaultMetPayRemotePath.Replace("'", "'\''")
    $restartScript = @(
        'set -e',
        ('mkdir -p ''{0}''' -f $metpayEscaped),
        ('cd ''{0}''' -f $metpayEscaped),
        'tar -xzf /tmp/metpay-deploy.tar.gz',
        'sed -i ''s/\r$//'' backend/start-production.sh 2>/dev/null || true',
        'chmod +x backend/start-production.sh',
        ('mkdir -p ''{0}''' -f $escaped),
        ('cd ''{0}''' -f $escaped),
        'tar -xzf /tmp/teling2026-deploy.tar.gz',
        'sed -i ''s/\r$//'' start-production.sh scripts/*.cjs 2>/dev/null || true',
        'chmod +x start-production.sh',
        'ss -ltnp 2>/dev/null | grep '':10024'' | sed -n ''s/.*pid=\([0-9]*\).*/\1/p'' | xargs -r kill 2>/dev/null || true',
        'ss -ltnp 2>/dev/null | grep '':8000'' | sed -n ''s/.*pid=\([0-9]*\).*/\1/p'' | xargs -r kill 2>/dev/null || true',
        'ss -ltnp 2>/dev/null | grep '':5050'' | sed -n ''s/.*pid=\([0-9]*\).*/\1/p'' | xargs -r kill 2>/dev/null || true',
        'sleep 2',
        'ss -ltnp 2>/dev/null | grep -q '':5050'' || (cd /opt/teling/ssd-admin-app && SSD_ADMIN_APP_PORT=5050 nohup .venv/bin/python app.py >> flask.log 2>&1 </dev/null &)',
        'export METPAY_DIR=/opt/teling/metpay',
        'nohup bash start-production.sh > deploy.log 2>&1 </dev/null &',
        'sleep 2',
        'tail -n 20 deploy.log || true',
        'ss -ltnp 2>/dev/null | grep -E ''8000|10024'' || true'
    ) -join "`n"
    return @"
cat > /tmp/teling-restart.sh << 'RESTART_EOF'
$restartScript
RESTART_EOF
sed -i 's/\r$//' /tmp/teling-restart.sh
chmod +x /tmp/teling-restart.sh
nohup bash /tmp/teling-restart.sh > /tmp/teling-restart.log 2>&1 </dev/null &
echo restart_scheduled
sleep 3
tail -n 15 /tmp/teling-restart.log || true
"@
}

if ($InspectOnly) {
    Show-ServerInspect
    exit 0
}

if ($DiscoverOnly) {
    $path = Resolve-RemotePath
    Write-Host "Remote path: $path"
    exit 0
}

$target = if ($RemotePath) { $RemotePath } else { "/opt/teling" }
$archive = Join-Path $env:TEMP ("teling2026-deploy-{0}.tar.gz" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$metpayArchive = Join-Path $env:TEMP ("metpay-deploy-{0}.tar.gz" -f (Get-Date -Format "yyyyMMdd-HHmmss"))

if (-not $RemotePath) {
    $target = Resolve-RemotePath
}

if (-not $SkipBuild) {
    Write-Host "[*] Local production build..."
    Push-Location $ProjectRoot
    npm run build
    Pop-Location
}

Write-Host "[*] Packing files..."
Push-Location $ProjectRoot
& tar -czf $archive `
    --exclude=node_modules `
    --exclude=.git `
    --exclude=.next-dev `
    --exclude=.next `
    --exclude=public/images `
    --exclude=ssd-admin-app/export `
    --exclude=ssd-admin-app/__pycache__ `
    --exclude=ssd-admin-app/*.db `
    --exclude=.vscode `
    .
Pop-Location

Write-Host "[*] Packing MetPay from $MetPayRoot ..."
Push-Location $MetPayRoot
& tar -czf $metpayArchive `
    --exclude=.git `
    --exclude=backend/.venv `
    --exclude=backend/__pycache__ `
    --exclude=backend/.pytest_cache `
    --exclude=backend/.ruff_cache `
    --exclude=backend/*.egg-info `
    --exclude=backend/test_metpay.db `
    .
Pop-Location

Write-Host "[*] Uploading archives to $SshTarget ..."
& scp @(Get-TransportOpts -Tool scp) $archive "${SshTarget}:/tmp/teling2026-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) {
    throw "SCP upload failed for teling2026"
}
& scp @(Get-TransportOpts -Tool scp) $metpayArchive "${SshTarget}:/tmp/metpay-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) {
    throw "SCP upload failed for MetPay"
}

Write-Host "[*] Extracting and restarting on server..."
$remoteCmd = (Get-RemoteDeployCommand -Target $target) -replace "`r`n", "`n" -replace "`r", ""
Invoke-SshCommand -Command $remoteCmd

Remove-Item $archive -Force -ErrorAction SilentlyContinue
Remove-Item $metpayArchive -Force -ErrorAction SilentlyContinue
Write-Host "[*] Deploy finished: https://teling.by"
Write-Host "[*] ArtPay webhook: https://teling.by/api/webhooks/artpay"
