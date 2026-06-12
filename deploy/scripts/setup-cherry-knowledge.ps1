# Enable Cherry Studio -> Khoj automatic knowledge sync
$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== Cherry Studio knowledge sync ===" -ForegroundColor Cyan

# 1. Khoj must be running
$khoj = docker ps --filter "name=^khoj$" --format "{{.Names}}" 2>$null
if (-not $khoj) {
    Write-Host "Starting Khoj..." -ForegroundColor Yellow
    Set-Location $DeployRoot
    powershell -File scripts\setup-khoj.ps1
}

# 2. Khoj LLM endpoint (search click opens chat and needs a working model API)
powershell -File (Join-Path $DeployRoot "scripts\configure-khoj-api.ps1")

# 3. Bridge
powershell -File (Join-Path $DeployRoot "scripts\start-cherry-bridge.ps1")
Start-Sleep -Seconds 2

# 4. Point Cherry providers at local bridge
Set-Location $DeployRoot
powershell -File scripts\configure-cherry-studio.ps1

Write-Host ""
Write-Host "Done. Cherry traffic flow:" -ForegroundColor Green
Write-Host "  Cherry Studio -> http://127.0.0.1:5892 -> VPS Sub2API"
Write-Host "  Each chat -> brain/imports/cherry/*.md -> Khoj index"
Write-Host "  Search in Khoj: http://localhost:5871"
Write-Host ""
Write-Host "After chatting in Cherry, wait a few seconds then search the question in Khoj."
