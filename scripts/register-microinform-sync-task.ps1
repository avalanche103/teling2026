# Register a daily Windows Task Scheduler job for Microinform price sync at 09:30.
# Local/dev only. Production uses Linux cron:
#   bash scripts/install-microinform-cron.sh   # on VPS → 09:30 Europe/Minsk
# Assumes the machine clock is Europe/Minsk (or UTC+3). Run once from an elevated PowerShell:
#   powershell -ExecutionPolicy Bypass -File .\scripts\register-microinform-sync-task.ps1
#
# Protocol (same as prod): fetch XLS → apply prices/delivery → hide absent →
# new SKUs stay pending (no auto-enrich / no auto-publish).
# Manual run:  npm run microinform:sync

$ErrorActionPreference = "Stop"

$TaskName = "Teling-Microinform-DailySync"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogDir = Join-Path $RepoRoot "data\microinform"
$StdoutLog = Join-Path $LogDir "sync-task-stdout.log"
$StderrLog = Join-Path $LogDir "sync-task-stderr.log"

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir | Out-Null
}

$NpmCmd = $null
$npmCmdInfo = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npmCmdInfo) { $NpmCmd = $npmCmdInfo.Source }
if (-not $NpmCmd) {
  $npmInfo = Get-Command npm -ErrorAction SilentlyContinue
  if ($npmInfo) { $NpmCmd = $npmInfo.Source }
}
if (-not $NpmCmd) {
  throw "npm not found in PATH. Install Node.js or open a shell where npm is available."
}

# schtasks / cmd.exe needs a single command line; quote paths with spaces.
$ActionCommand = "cmd.exe"
$ActionArgs = "/c `"cd /d `"$RepoRoot`" && `"$NpmCmd`" run microinform:sync >> `"$StdoutLog`" 2>> `"$StderrLog`"`""

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$Action = New-ScheduledTaskAction -Execute $ActionCommand -Argument $ActionArgs -WorkingDirectory $RepoRoot
$Trigger = New-ScheduledTaskTrigger -Daily -At "09:30"
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "Teling: daily Microinform price fetch/apply at 09:30 (local/Minsk time)" `
  -User $env:USERNAME `
  | Out-Null

Write-Host "Registered task '$TaskName' daily at 09:30."
Write-Host "Repo: $RepoRoot"
Write-Host "Logs: $StdoutLog / $StderrLog"
Write-Host "Test now:  npm run microinform:sync"
Write-Host "Remove:    Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
