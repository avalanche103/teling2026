param(
    [string]$HostName = "134.17.16.134",
    [int]$Port = 22,
    [string]$User = "user",
    [string]$KeyPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $KeyPath) {
    $KeyPath = Join-Path $env:USERPROFILE ".ssh\id_ed25519_teling"
}

$pubPath = "$KeyPath.pub"
$sshDir = Split-Path $KeyPath -Parent
$SshTarget = "${User}@${HostName}"

if (-not (Test-Path $sshDir)) {
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
}

if (-not (Test-Path $KeyPath)) {
    Write-Host "[*] Creating SSH key: $KeyPath"
    & ssh-keygen -t ed25519 -f $KeyPath -C "teling-deploy" -N '""'
} else {
    Write-Host "[*] Using existing key: $KeyPath"
}

$pubKey = (Get-Content $pubPath -Raw).Trim().Replace("`r", "").Replace("`n", "")
Write-Host "[*] Public key:"
Write-Host "    $pubKey"
Write-Host ""
Write-Host "[*] Installing on $SshTarget (enter server password once)..."

$escapedPubKey = $pubKey.Replace("'", "'\''")
$remoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && { grep -qxF '$escapedPubKey' ~/.ssh/authorized_keys || echo '$escapedPubKey' >> ~/.ssh/authorized_keys; } && echo OK"

& ssh -p $Port -o PreferredAuthentications=password -o PubkeyAuthentication=no $SshTarget $remoteCmd
if ($LASTEXITCODE -ne 0) {
    throw "Failed to install public key on server"
}

Write-Host "[*] Testing key login..."
& ssh -p $Port -i $KeyPath -o IdentitiesOnly=yes -o BatchMode=yes $SshTarget "echo SSH key works; whoami"
if ($LASTEXITCODE -ne 0) {
    throw "Key login test failed"
}

$configPath = Join-Path $sshDir "config"
$configBlock = @"

Host teling
    HostName $HostName
    User $User
    Port $Port
    IdentityFile $KeyPath
    IdentitiesOnly yes
"@

if (Test-Path $configPath) {
    $existing = Get-Content $configPath -Raw
    if ($existing -notmatch '(?m)^Host teling\s*$') {
        Add-Content -Path $configPath -Value $configBlock
        Write-Host "[*] Added Host teling to $configPath"
    } else {
        Write-Host "[*] Host teling already in $configPath"
    }
} else {
    Set-Content -Path $configPath -Value $configBlock.TrimStart()
    Write-Host "[*] Created $configPath with Host teling"
}

Write-Host ""
Write-Host "[*] Done. Deploy without password:"
Write-Host "    .\scripts\deploy.ps1"
