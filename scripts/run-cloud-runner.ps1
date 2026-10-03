$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$mutex = [System.Threading.Mutex]::new($false, 'Local\ThePitRunner')
$ownsMutex = $false
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
  Write-Host "Starting one THE PIT runner for $env:NEXT_PUBLIC_SPACETIME_DB. Press Ctrl+C to stop."
  & corepack pnpm --filter runner start
  $runnerExit = $LASTEXITCODE
} finally {
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}

exit $runnerExit
