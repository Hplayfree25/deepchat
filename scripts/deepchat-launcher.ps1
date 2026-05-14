$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$port = if ($env:DEEPCHAT_PORT) { [int]$env:DEEPCHAT_PORT } else { 3000 }
$hostAddress = "0.0.0.0"
$localUrl = "http://localhost:$port"
$dataDirs = @(
  "data",
  "data\chat",
  "data\chat\sharechat",
  "data\llm",
  "data\llm\api",
  "data\temp",
  "data\temp\file",
  "data\user",
  "data\user\memories",
  "data\backups",
  "data\logs"
)

foreach ($dir in $dataDirs) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

$env:DEEPCHAT_AI_LOG = "1"
$env:DEEPCHAT_LOG_FILE = Join-Path $root "data\logs\deepchat.log"

function Write-Line($text = "", $color = "Gray") {
  Write-Host $text -ForegroundColor $color
}

function Write-Rule {
  Write-Host ("-" * 64) -ForegroundColor DarkGray
}

function Get-LanAddress {
  try {
    $ip = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
      } |
      Select-Object -First 1 -ExpandProperty IPAddress
    if ($ip) { return $ip }
  } catch {
  }
  return "localhost"
}

function Test-PortBusy($targetPort) {
  try {
    return [bool](Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
  } catch {
    return $false
  }
}

function Get-PortOwnerPid($targetPort) {
  try {
    $connection = Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) { return $connection.OwningProcess }
  } catch {
  }
  return $null
}

function Get-LatestSourceWriteTime {
  $paths = @(
    "src",
    "public",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "next.config.ts",
    "postcss.config.mjs",
    "tsconfig.json"
  )
  $latest = [DateTime]::MinValue
  foreach ($item in $paths) {
    if (-not (Test-Path $item)) { continue }
    $target = Get-Item $item
    if ($target.PSIsContainer) {
      $candidate = Get-ChildItem $item -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
      if ($candidate -and $candidate.LastWriteTime -gt $latest) { $latest = $candidate.LastWriteTime }
    } elseif ($target.LastWriteTime -gt $latest) {
      $latest = $target.LastWriteTime
    }
  }
  return $latest
}

function Test-BuildStale {
  $buildId = ".next\BUILD_ID"
  if (-not (Test-Path $buildId)) { return $true }
  $latestSource = Get-LatestSourceWriteTime
  $buildTime = (Get-Item $buildId).LastWriteTime
  return $latestSource -gt $buildTime
}

function Stop-PortOwner($targetPort) {
  $ownerPid = Get-PortOwnerPid $targetPort
  if (-not $ownerPid) { return }
  Write-Line "  Stopping old DeepChat process on port $targetPort (PID $ownerPid)..." Yellow
  & taskkill.exe /PID $ownerPid /T /F | Out-Null
  Start-Sleep -Seconds 2
}

function Invoke-Step($label, $command, $arguments) {
  Write-Line "  $label" Yellow
  $process = Start-Process -FilePath $command -ArgumentList $arguments -WorkingDirectory $root -NoNewWindow -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "$label failed with exit code $($process.ExitCode)."
  }
}

function Should-ShowServerLine($line) {
  if ([string]::IsNullOrWhiteSpace($line)) { return $false }
  $plain = $line -replace "`e\[[0-9;]*m", ""
  if ($line -match "\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b") { return $false }
  if ($plain -match "Next\.js|Local:\s+http|Network:\s+http|Ready in") { return $false }
  if ($plain -match "^\s*(event|wait|ready|compiled|route|rendered|cache|webpack|turbopack)\b") { return $false }
  return $true
}

function Start-FilteredServer {
  $nextCmd = Join-Path $root "node_modules\.bin\next.cmd"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $nextCmd
  $psi.Arguments = "start -H $hostAddress -p $port"
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true

  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  $process.EnableRaisingEvents = $true

  $handler = {
    if ($EventArgs.Data -eq $null) { return }
    $line = $EventArgs.Data
    Add-Content -Path $env:DEEPCHAT_LOG_FILE -Value $line
    if (Should-ShowServerLine $line) {
      if ($line -match "^\[AI\]") {
        Write-Host $line -ForegroundColor Cyan
      } elseif ($line -match "error|failed|invalid|exception" ) {
        Write-Host $line -ForegroundColor Red
      } else {
        Write-Host $line -ForegroundColor Gray
      }
    }
  }

  Register-ObjectEvent -InputObject $process -EventName OutputDataReceived -Action $handler | Out-Null
  Register-ObjectEvent -InputObject $process -EventName ErrorDataReceived -Action $handler | Out-Null

  [void]$process.Start()
  $process.BeginOutputReadLine()
  $process.BeginErrorReadLine()

  Start-Sleep -Seconds 3
  if ($process.HasExited) {
    return $process.ExitCode
  }
  Start-Process $localUrl
  $process.WaitForExit()
  return $process.ExitCode
}

$lanIp = Get-LanAddress
$lanUrl = "http://$lanIp`:$port"

Clear-Host
Write-Line ""
Write-Line "   ____                  ____ _           _   " Blue
Write-Line "  |  _ \  ___  ___ _ __ / ___| |__   __ _| |_ " Blue
Write-Line "  | | | |/ _ \/ _ \ '_ \ |   | '_ \ / _` | __|" Blue
Write-Line "  | |_| |  __/  __/ |_) | |___| | | | (_| | |_ " Blue
Write-Line "  |____/ \___|\___| .__/ \____|_| |_|\__,_|\__|" Blue
Write-Line "                  |_|                          " Blue
Write-Line ""
Write-Line "  Modern local AI workspace launcher" DarkGray
Write-Rule
Write-Line "  Local      $localUrl" Green
Write-Line "  LAN Local  $lanUrl" Cyan
Write-Line "  Logs       data\logs\deepchat.log" DarkGray
Write-Line "  Console    HTTP GET/POST hidden, AI summary shown" DarkGray
Write-Rule

try {
  if (Test-PortBusy $port) {
    $ownerPid = Get-PortOwnerPid $port
    $ownerText = if ($ownerPid) { " by PID $ownerPid" } else { "" }
    Write-Line "  Port $port is already running$ownerText." Yellow
    Write-Line "  R  Restart server with the latest build" Green
    Write-Line "  O  Open the running server" Cyan
    Write-Line "  Q  Quit launcher" DarkGray
    $choice = Read-Host "  Choose"
    if ($choice -match "^[Oo]") {
      Start-Process $localUrl
      exit 0
    }
    if ($choice -notmatch "^[Rr]") {
      exit 0
    }
    Stop-PortOwner $port
    if (Test-PortBusy $port) {
      throw "Port $port is still busy. Close the old server window and run deepchat.bat again."
    }
  }

  if (-not (Test-Path "node_modules\.bin\next.cmd")) {
    Invoke-Step "Installing dependencies..." "npx.cmd" @("pnpm@10", "install", "--allow-build=better-sqlite3")
  }

  if (Test-BuildStale) {
    Invoke-Step "Building production app..." "npm.cmd" @("run", "build")
  } else {
    Write-Line "  Production build is fresh." DarkGray
  }

  Write-Line "  Starting DeepChat..." Green
  Write-Line ""
  $exitCode = Start-FilteredServer
  Write-Line ""
  Write-Line "  DeepChat stopped with exit code $exitCode." Yellow
  Read-Host "  Press Enter to close this launcher"
  exit $exitCode
} catch {
  Write-Line ""
  Write-Line "  DeepChat launcher failed:" Red
  Write-Line "  $($_.Exception.Message)" Red
  Write-Line ""
  Read-Host "  Press Enter to close this launcher"
  exit 1
}
