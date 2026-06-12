$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $DeployRoot
$khojPort = "5871"
if (Test-Path ".env") {
    foreach ($line in Get-Content ".env") {
        if ($line -match '^KHOJ_PORT=(.+)$') { $khojPort = $Matches[1].Trim() }
    }
}
Write-Host "=== Personal Brain (VPS mode) ===" -ForegroundColor Cyan
docker compose -f docker-compose.khoj.yml ps 2>$null
function T($u) { try { return (Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 10).StatusCode } catch { return "FAIL" } }
Write-Host "VPS Sub2API :$(T 'https://api.coolapihub.khtain.com/health')  https://api.coolapihub.khtain.com"
Write-Host "Khoj local  :$(T "http://localhost:$khojPort")  http://localhost:$khojPort"
$keySet = (Select-String -Path ".env" -Pattern '^SUB2API_API_KEY=(.+)$' | ForEach-Object { $_.Matches.Groups[1].Value })
if ($keySet -and $keySet -ne 'replace-me-run-set-api-key') { Write-Host "API Key     : configured" } else { Write-Host "API Key     : NOT SET (run set-api-key.ps1)" -ForegroundColor Yellow }
