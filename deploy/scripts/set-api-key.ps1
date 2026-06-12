# 设置 VPS Sub2API API Key 并重启 Khoj
# 用法: powershell -File scripts\set-api-key.ps1 -ApiKey "sk-xxx"

param(
    [Parameter(Mandatory = $false)]
    [string]$ApiKey
)

$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $DeployRoot ".env"

if (-not $ApiKey) {
    Write-Host "请输入 VPS Sub2API 后台创建的 API Key (sk-...):" -ForegroundColor Cyan
    $ApiKey = Read-Host "API Key"
}
$ApiKey = $ApiKey.Trim()
if (-not $ApiKey) { throw "API Key 不能为空" }

$lines = @()
if (Test-Path $envFile) {
    $found = $false
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*SUB2API_API_KEY=') {
            $lines += "SUB2API_API_KEY=$ApiKey"
            $found = $true
        } elseif ($line -match '^\s*SUB2API_REMOTE_URL=') {
            $lines += "SUB2API_REMOTE_URL=https://api.coolapihub.khtain.com/v1/"
            $found = $found
        } else {
            $lines += $line
        }
    }
    if (-not ($lines -match '^SUB2API_API_KEY=')) { $lines += "SUB2API_API_KEY=$ApiKey" }
    if (-not ($lines -match '^SUB2API_REMOTE_URL=')) { $lines += "SUB2API_REMOTE_URL=https://api.coolapihub.khtain.com/v1/" }
} else {
    throw ".env 不存在，请先运行 setup-khoj.ps1"
}

Set-Content -Path $envFile -Value ($lines -join "`n") -Encoding UTF8
Set-Location $DeployRoot
docker compose -f docker-compose.khoj.yml up -d khoj
Write-Host "API Key 已保存，Khoj 已重启。" -ForegroundColor Green
Write-Host "测试: 打开 http://localhost:5871 发一条消息"
