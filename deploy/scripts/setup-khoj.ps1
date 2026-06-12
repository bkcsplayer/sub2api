# VPS 模式：仅部署本地 Khoj，Sub2API 走 coolapihub
# 用法: cd deploy && powershell -File scripts\setup-khoj.ps1

$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $DeployRoot

Write-Host "=== Khoj (VPS Sub2API mode) ===" -ForegroundColor Cyan

function New-SecretHex([int]$Bytes = 32) {
    $buf = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    return ([BitConverter]::ToString($buf) -replace '-', '').ToLower()
}

foreach ($d in @("brain/data/postgres","brain/data/khoj_config","brain/data/models","brain/data/searxng","brain/obsidian-vault","brain/imports")) {
    $p = Join-Path $DeployRoot $d
    if (-not (Test-Path $p)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
}

# 停掉本地 Sub2API（账号在 VPS，不需要本地网关）
foreach ($name in @("sub2api","sub2api-postgres","sub2api-redis")) {
    $id = docker ps -aq --filter "name=^${name}$" 2>$null
    if ($id) { Write-Host "Stop local Sub2API: $name"; docker rm -f $id 2>$null | Out-Null }
}

$envFile = Join-Path $DeployRoot ".env"
$vars = @{}
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*([^#=]+)=(.*)$') { $vars[$Matches[1].Trim()] = $Matches[2].Trim() }
    }
}

if (-not $vars['KHOJ_DJANGO_SECRET_KEY']) { $vars['KHOJ_DJANGO_SECRET_KEY'] = (New-SecretHex) }
if (-not $vars['KHOJ_ADMIN_PASSWORD']) { $vars['KHOJ_ADMIN_PASSWORD'] = (New-SecretHex 8) }
if (-not $vars['KHOJ_POSTGRES_PASSWORD']) { $vars['KHOJ_POSTGRES_PASSWORD'] = (New-SecretHex 16) }

$skip = '^(KHOJ_|SUB2API_API_KEY|SUB2API_REMOTE_URL|KHOJ_PORT=|CHERRY_STUDIO_)'
$out = if (Test-Path $envFile) { Get-Content $envFile | Where-Object { $_ -notmatch $skip } } else { @() }
$out += ""
$out += "# --- Khoj + VPS Sub2API ---"
$out += "SUB2API_REMOTE_URL=https://api.coolapihub.khtain.com/v1/"
$out += "SUB2API_API_KEY=$($vars['SUB2API_API_KEY'])"
$out += "KHOJ_PORT=5871"
$out += "CHERRY_STUDIO_INSTALL_PATH=E:\cherry-studio\Cherry Studio"
$out += "KHOJ_ADMIN_EMAIL=brain@localhost"
$out += "KHOJ_ADMIN_PASSWORD=$($vars['KHOJ_ADMIN_PASSWORD'])"
$out += "KHOJ_POSTGRES_USER=postgres"
$out += "KHOJ_POSTGRES_PASSWORD=$($vars['KHOJ_POSTGRES_PASSWORD'])"
$out += "KHOJ_POSTGRES_DB=postgres"
$out += "KHOJ_DJANGO_SECRET_KEY=$($vars['KHOJ_DJANGO_SECRET_KEY'])"
Set-Content -Path $envFile -Value ($out -join "`n") -Encoding UTF8

# VPS 连通性
try {
    $h = Invoke-WebRequest -Uri "https://api.coolapihub.khtain.com/health" -UseBasicParsing -TimeoutSec 10
    Write-Host "VPS Sub2API: OK ($($h.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "VPS Sub2API: 无法连接，请检查网络" -ForegroundColor Red
}

if (-not $vars['SUB2API_API_KEY']) {
    Write-Host ""
    Write-Host "尚未配置 SUB2API_API_KEY！" -ForegroundColor Yellow
    Write-Host "请先在 VPS 管理后台创建 API Key，然后执行:"
    Write-Host '  powershell -File scripts\set-api-key.ps1 -ApiKey "sk-..."'
    Write-Host ""
}

docker compose -f docker-compose.khoj.yml pull
docker compose -f docker-compose.khoj.yml up -d

# Khoj stores LLM endpoint in Postgres; env OPENAI_* alone is not enough after first boot.
Start-Sleep -Seconds 5
powershell -File (Join-Path $DeployRoot "scripts\configure-khoj-api.ps1")

Write-Host ""
Write-Host "Khoj: http://localhost:5871" -ForegroundColor Green
Write-Host "Khoj admin password: $($vars['KHOJ_ADMIN_PASSWORD'])"
Write-Host "完整说明: deploy\brain\SETUP_GUIDE.md"
