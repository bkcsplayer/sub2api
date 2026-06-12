# Start Cherry -> Khoj API bridge (background)
$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ScriptDir = Join-Path $DeployRoot "scripts"
$PidFile = Join-Path $DeployRoot "tmp\cherry-bridge.pid"
$LogFile = Join-Path $DeployRoot "brain\data\cherry-bridge.log"

New-Item -ItemType Directory -Force -Path (Split-Path $PidFile) | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null

foreach ($conn in Get-NetTCPConnection -LocalPort 5892 -ErrorAction SilentlyContinue) {
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
}

if (Test-Path $PidFile) {
    $oldPid = Get-Content $PidFile -Raw
    if ($oldPid -match '^\d+$') {
        Stop-Process -Id ([int]$oldPid) -Force -ErrorAction SilentlyContinue
    }
}

Push-Location $ScriptDir
try {
    if (-not (Test-Path "node_modules\classic-level")) {
        npm install classic-level --no-save | Out-Null
    }
    $errLog = Join-Path $DeployRoot "brain\data\cherry-bridge.err.log"
    $proc = Start-Process -FilePath "node" `
        -ArgumentList "cherry-khoj-bridge.mjs" `
        -WorkingDirectory $ScriptDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $LogFile `
        -RedirectStandardError $errLog `
        -PassThru
    $proc.Id | Set-Content $PidFile -Encoding ascii
    Write-Host "Cherry-Khoj bridge started (PID $($proc.Id))" -ForegroundColor Green
    Write-Host "Log: $LogFile"
} finally {
    Pop-Location
}
