# Ensure Khoj + Cherry bridge are running (login task + watchdog).
# Idempotent: safe to run every few minutes.
$ErrorActionPreference = "SilentlyContinue"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$LogDir = Join-Path $DeployRoot "brain\data"
$LogFile = Join-Path $LogDir "ensure-brain-services.log"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Log([string]$msg) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
    Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Test-HttpOk([string]$Url, [int]$TimeoutSec = 4) {
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec
        return $r.StatusCode -ge 200 -and $r.StatusCode -lt 400
    } catch {
        return $false
    }
}

function Wait-Docker([int]$MaxSec = 120) {
    $deadline = (Get-Date).AddSeconds($MaxSec)
    while ((Get-Date) -lt $deadline) {
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { return $true }
        Start-Sleep -Seconds 5
    }
    return $false
}

function Ensure-Khoj {
    if (Test-HttpOk "http://127.0.0.1:5871") {
        return
    }
    if (-not (Wait-Docker 90)) {
        Log "Khoj skip: Docker not ready"
        return
    }
    Set-Location $DeployRoot
    docker compose -f docker-compose.khoj.yml up -d 2>&1 | Out-Null
    Log "Khoj: docker compose up -d"
    Start-Sleep -Seconds 8
}

function Ensure-Bridge {
    if (Test-HttpOk "http://127.0.0.1:5892/brain/health") {
        return
    }
    $bridgePs1 = Join-Path $DeployRoot "scripts\start-cherry-bridge.ps1"
    if (-not (Test-Path $bridgePs1)) {
        Log "Bridge skip: missing start-cherry-bridge.ps1"
        return
    }
    powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $bridgePs1 | Out-Null
    Log "Bridge: started via start-cherry-bridge.ps1"
    Start-Sleep -Seconds 2
}

Log "=== ensure run ==="
Ensure-Khoj
Ensure-Bridge

$khojOk = Test-HttpOk "http://127.0.0.1:5871"
$bridgeOk = Test-HttpOk "http://127.0.0.1:5892/brain/health"
Log "status khoj=$khojOk bridge=$bridgeOk"
