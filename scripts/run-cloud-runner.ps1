$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logDirectory = Join-Path $repoRoot '.tools'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$logPath = Join-Path $logDirectory 'cloud-runner.log'
$mutex = [System.Threading.Mutex]::new($false, 'Local\ThePitRunner')
$ownsMutex = $false
function Write-RunnerLog([string]$message) {
  $line = "$(Get-Date -Format o) $message"
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  Write-Host $line
}
try {
  try {
    $ownsMutex = $mutex.WaitOne(0)
  } catch [System.Threading.AbandonedMutexException] {
    $ownsMutex = $true
  }
  if (-not $ownsMutex) { throw 'THE PIT runner is already running on this machine.' }

  $localCli = Join-Path $repoRoot '.tools/spacetime/spacetime.exe'
  $cli = if (Test-Path -LiteralPath $localCli) { $localCli } else { (Get-Command spacetime -ErrorAction Stop).Source }
  $loginOutput = & $cli login show --token
  if ($LASTEXITCODE -ne 0) { throw 'Sign in with spacetime login first.' }
  $token = [regex]::Match(($loginOutput -join ' '), '[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')
  if (-not $token.Success) { throw 'The SpacetimeDB CLI login did not return an auth token.' }

  $env:ADMIN_TOKEN = $token.Value
  $env:NEXT_PUBLIC_SPACETIME_URI = 'wss://maincloud.spacetimedb.com'
  $env:NEXT_PUBLIC_SPACETIME_DB = 'the-pit-mhacks-2026'
  if (-not $env:PIT_BOT_COUNT) { $env:PIT_BOT_COUNT = '3' }

  Set-Location -LiteralPath $repoRoot
  while ($true) {
    Write-RunnerLog "Starting one THE PIT runner for $env:NEXT_PUBLIC_SPACETIME_DB."
    $ErrorActionPreference = 'Continue' # Windows PowerShell treats redirected native stderr as an error record.
    & corepack pnpm --filter runner start 2>&1 | ForEach-Object {
      $line = [regex]::Replace([string]$_, 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', '[REDACTED_TOKEN]')
      Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
      Write-Host $line
    }
    $ErrorActionPreference = 'Stop'
    Write-RunnerLog "Runner exited with code $LASTEXITCODE; restarting in 5 seconds."
    Start-Sleep -Seconds 5
  }
} finally {
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
