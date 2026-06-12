$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Write-Host "=== Cherry Studio 接入 VPS Sub2API ===" -ForegroundColor Cyan
Write-Host "API Base: https://api.coolapihub.khtain.com"
Write-Host "自动配置: powershell -File scripts\configure-cherry-studio.ps1"
Write-Host "配置说明: $DeployRoot\brain\SETUP_GUIDE.md"
$exe = "E:\cherry-studio\Cherry Studio\Cherry Studio.exe"
if (Test-Path $exe) { Start-Process $exe } else { Write-Host "请手动启动 Cherry Studio" }
