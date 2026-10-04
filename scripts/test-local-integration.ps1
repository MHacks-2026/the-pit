$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$cliPath = Join-Path $repoRoot '.tools/spacetime/spacetime.exe'
$cli = if (Test-Path -LiteralPath $cliPath) { $cliPath } else { (Get-Command spacetime -ErrorAction Stop).Source }
$node = (Get-Command node -ErrorAction Stop).Source
$runId = [guid]::NewGuid().ToString('N').Substring(0, 12)
$database = "pit-it-$runId"
$workDirectory = Join-Path $repoRoot ".tools/integration-$runId"
$moduleDirectory = Join-Path $repoRoot 'spacetimedb/spacetimedb'
$runnerDirectory = Join-Path $repoRoot 'apps/runner'
$server = $null
$runner = $null

New-Item -ItemType Directory -Path $workDirectory -Force | Out-Null
$tcp = [Net.Sockets.TcpClient]::new()
try {
  $portBusy = $tcp.ConnectAsync('127.0.0.1', 3000).Wait(500)
} catch {
  $portBusy = $false
} finally {
  $tcp.Dispose()
}
if ($portBusy) { throw 'Port 3000 is already in use; stop the other local server first.' }

function Wait-Until([scriptblock]$condition, [int]$timeoutSeconds, [string]$message) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while (-not (& $condition)) {
    if ((Get-Date) -ge $deadline) { throw $message }
    Start-Sleep -Milliseconds 200
  }
}

try {
  $server = Start-Process -FilePath $cli -ArgumentList @(
    'start', '--in-memory', '--non-interactive', '--listen-addr', '127.0.0.1:3000',
    '--data-dir', "`"$workDirectory`""
  ) -WorkingDirectory $repoRoot -RedirectStandardOutput (Join-Path $workDirectory 'server.out.log') `
    -RedirectStandardError (Join-Path $workDirectory 'server.err.log') -WindowStyle Hidden -PassThru
  Wait-Until {
    if ($server.HasExited) { throw 'Disposable SpacetimeDB server exited during startup.' }
    $socket = [Net.Sockets.TcpClient]::new()
    try { $socket.ConnectAsync('127.0.0.1', 3000).Wait(200) } catch { $false } finally { $socket.Dispose() }
  } 20 'Disposable SpacetimeDB server did not become ready.'

  & $cli publish $database --module-path $moduleDirectory --server local --yes --no-config
  if ($LASTEXITCODE -ne 0) { throw 'Publishing the module to the disposable database failed.' }
  $loginOutput = & $cli login show --token
  if ($LASTEXITCODE -ne 0) { throw 'SpacetimeDB CLI login is required for local admin tests.' }
  $token = [regex]::Match(($loginOutput -join ' '), 'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')
  if (-not $token.Success) { throw 'SpacetimeDB CLI did not return an admin token.' }

  $env:PIT_TEST_DATABASE = $database
  $env:ADMIN_TOKEN = $token.Value
  $env:NEXT_PUBLIC_SPACETIME_URI = 'ws://127.0.0.1:3000'
  $env:NEXT_PUBLIC_SPACETIME_DB = $database
  $env:PIT_RUNNER_TOKEN_FILE = Join-Path $workDirectory 'runner-tokens.json'
  Set-Location -LiteralPath $repoRoot
  & corepack pnpm exec vitest run spacetimedb/test/integration.test.ts apps/runner/test/integration.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'Exchange and bot acceptance tests failed.' }

  $runner = Start-Process -FilePath $node -ArgumentList @('--import', 'tsx', 'src/index.ts') `
    -WorkingDirectory $runnerDirectory -RedirectStandardOutput (Join-Path $workDirectory 'runner.out.log') `
    -RedirectStandardError (Join-Path $workDirectory 'runner.err.log') -WindowStyle Hidden -PassThru
  $runnerLog = Join-Path $workDirectory 'runner.out.log'
  Wait-Until {
    if ($runner.HasExited) { throw 'Disposable runner exited during startup.' }
    (Test-Path -LiteralPath $runnerLog) -and
      (Select-String -LiteralPath $runnerLog -Pattern 'Runner connected 5 bot identities' -Quiet)
  } 20 'Disposable runner did not connect.'

  $env:PIT_COP_RUNNER_ACTIVE = 'true'
  & corepack pnpm exec vitest run apps/runner/test/cop-path.test.ts
  if ($LASTEXITCODE -ne 0) { throw 'Cop acceptance test failed.' }
  Write-Host "All disposable database acceptance tests passed for $database."
} finally {
  if ($runner -and -not $runner.HasExited) { & taskkill.exe /PID $runner.Id /T /F | Out-Null }
  if ($server -and -not $server.HasExited) { & taskkill.exe /PID $server.Id /T /F | Out-Null }
  Remove-Item -LiteralPath (Join-Path $workDirectory 'runner-tokens.json') -Force -ErrorAction SilentlyContinue
}
