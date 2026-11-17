param(
    [string]$HostName = "134.17.16.134",
    [int]$Port = 22,
    [string]$User = "user",
    [string]$RemotePath = "/opt/teling",
    [string]$IdentityFile = "",
    [switch]$InspectOnly,
    [switch]$UseScp
)

# Sync local public/images to VPS without going through deploy.tar
# (deploy.ps1 excludes public/images on purpose).
#
# Default: stream tar over SSH (no /tmp archive on the VPS — saves disk).
# Use -UseScp to fall back to scp of a local .tar.gz (more reliable on Windows).

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LocalImages = Join-Path $ProjectRoot "public\images"
$SshTarget = "${User}@${HostName}"
$DefaultKeyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519_teling"
$Archive = Join-Path $env:TEMP "teling-images-sync.tar.gz"
$Stream = -not $UseScp

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

function Invoke-SshCommand {
    param([string]$Command)
    $output = & ssh @(Get-TransportOpts) $SshTarget $Command 2>&1
    if ($LASTEXITCODE -ne 0) {
        if ($output) { $output | ForEach-Object { Write-Host $_ } }
        throw "SSH command failed with exit code $LASTEXITCODE"
    }
    return $output
}

if (-not (Test-Path $LocalImages)) {
    throw "Local images dir missing: $LocalImages"
}

$localCount = (Get-ChildItem -Path $LocalImages -File -ErrorAction SilentlyContinue | Measure-Object).Count
$localSizeMb = [math]::Round(((Get-ChildItem -Path $LocalImages -File -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB), 1)

Write-Host "Local: $LocalImages ($localCount files, ~${localSizeMb} MB)"
Write-Host "Remote: ${SshTarget}:${RemotePath}/public/images"

$disk = Invoke-SshCommand -Command "df -h / | tail -n 1; echo '---'; ls -ld '$RemotePath/public/images' 2>/dev/null || echo 'MISSING images dir'; echo '---'; find '$RemotePath/public/images' -type f 2>/dev/null | wc -l"
$disk | ForEach-Object { Write-Host $_ }

if ($InspectOnly) {
    Write-Host "InspectOnly: no upload."
    exit 0
}

if ($localCount -lt 1) {
    throw "No local image files to sync."
}

# Ensure remote directory exists before extract.
Invoke-SshCommand -Command "mkdir -p '$RemotePath/public/images'" | Out-Null

if ($Stream) {
    Write-Host "Streaming tar over SSH (no remote /tmp archive)..."
    Push-Location (Join-Path $ProjectRoot "public")
    try {
        # Windows tar -> ssh stdin -> remote tar extract into /opt/teling/public
        $sshArgs = @(Get-TransportOpts) + @(
            $SshTarget,
            "tar -xzf - -C '$RemotePath/public' && find '$RemotePath/public/images' -type f | wc -l && df -h / | tail -n 1"
        )
        & tar -czf - "images" | & ssh @sshArgs
        if ($LASTEXITCODE -ne 0) { throw "stream sync failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "Packing images archive..."
    if (Test-Path $Archive) { Remove-Item $Archive -Force }

    Push-Location (Join-Path $ProjectRoot "public")
    try {
        & tar -czf $Archive "images"
        if ($LASTEXITCODE -ne 0) { throw "tar failed with exit code $LASTEXITCODE" }
    } finally {
        Pop-Location
    }

    $archiveMb = [math]::Round(((Get-Item $Archive).Length / 1MB), 1)
    Write-Host "Archive: $Archive (~${archiveMb} MB)"

    Write-Host "Uploading archive..."
    & scp @(Get-TransportOpts -Tool scp) $Archive "${SshTarget}:/tmp/teling-images-sync.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "scp failed with exit code $LASTEXITCODE" }

    Write-Host "Extracting on server (merge into public/images)..."
    Invoke-SshCommand -Command @"
set -e
mkdir -p '$RemotePath/public/images'
tar -xzf /tmp/teling-images-sync.tar.gz -C '$RemotePath/public'
rm -f /tmp/teling-images-sync.tar.gz
find '$RemotePath/public/images' -type f | wc -l
df -h / | tail -n 1
"@ | ForEach-Object { Write-Host $_ }

    Remove-Item $Archive -Force -ErrorAction SilentlyContinue
}

Write-Host "Done. Deploy still excludes public/images; this sync is the intended prod path."
