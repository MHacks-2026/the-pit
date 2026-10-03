$ErrorActionPreference = 'Stop'

$taskName = 'ThePitCloudRunner'
$launcher = (Resolve-Path (Join-Path $PSScriptRoot 'run-cloud-runner.ps1')).Path
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$powershell = Join-Path $PSHOME 'powershell.exe'
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$launcher`""

$existing = Get-ScheduledTask -TaskName $taskName -TaskPath '\' -ErrorAction SilentlyContinue
if ($existing) {
  $sameLauncher = $existing.Actions.Count -eq 1 -and
    $existing.Actions[0].Execute -eq $powershell -and
    $existing.Actions[0].Arguments -eq $arguments
  if (-not $sameLauncher) { throw "Task $taskName exists with a different action; inspect it manually." }
}

$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $repoRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
  -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Description 'THE PIT cloud bot and Market Cop runner' `
  -Force | Out-Null
Write-Host "Installed $taskName for $user at logon. Start it with Start-ScheduledTask -TaskName $taskName."
