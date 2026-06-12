# 已弃用：请使用 scripts\setup-khoj.ps1（VPS 模式，仅本地 Khoj）
# 用法: powershell -ExecutionPolicy Bypass -File scripts\setup-khoj.ps1

& (Join-Path $PSScriptRoot "setup-khoj.ps1")
exit $LASTEXITCODE

# --- legacy below ---

$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $DeployRoot

Write-Host "=== Sub2API Personal Brain Setup ===" -ForegroundColor Cyan

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "Docker not found. Install Docker Desktop first." -ForegroundColor Red
    exit 1
}
docker info *> $null

function New-SecretHex([int]$Bytes = 32) {
    $buf = New-Object byte[] $Bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
    return ([BitConverter]::ToString($buf) -replace '-', '').ToLower()
}

$dirs = @(
    "brain/data/postgres",
    "brain/data/khoj_config",
    "brain/data/models",
    "brain/data/searxng",
    "brain/obsidian-vault",
    "brain/imports",
    "data",
    "postgres_data",
    "redis_data"
)
foreach ($d in $dirs) {
    $p = Join-Path $DeployRoot $d
    if (-not (Test-Path $p)) {
        New-Item -ItemType Directory -Path $p -Force | Out-Null
        Write-Host "  mkdir $d"
    }
}

$envFile = Join-Path $DeployRoot ".env"
$envExample = Join-Path $DeployRoot ".env.personal.example"

# 合并/补全 .env
$vars = @{}
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*([^#=]+)=(.*)$') { $vars[$Matches[1].Trim()] = $Matches[2].Trim() }
    }
}

$vars['SERVER_PORT'] = '5870'
$vars['KHOJ_PORT'] = '5871'
$vars['RUN_MODE'] = 'simple'
if (-not $vars['CHERRY_STUDIO_INSTALL_PATH']) { $vars['CHERRY_STUDIO_INSTALL_PATH'] = 'E:\cherry-studio\Cherry Studio' }
if (-not $vars['KHOJ_DJANGO_SECRET_KEY']) { $vars['KHOJ_DJANGO_SECRET_KEY'] = (New-SecretHex) }
if (-not $vars['KHOJ_ADMIN_PASSWORD']) { $vars['KHOJ_ADMIN_PASSWORD'] = (New-SecretHex 8) }
if (-not $vars['KHOJ_POSTGRES_PASSWORD']) { $vars['KHOJ_POSTGRES_PASSWORD'] = (New-SecretHex 16) }
if (-not $vars['KHOJ_POSTGRES_USER']) { $vars['KHOJ_POSTGRES_USER'] = 'postgres' }
if (-not $vars['KHOJ_POSTGRES_DB']) { $vars['KHOJ_POSTGRES_DB'] = 'postgres' }
if (-not $vars['KHOJ_ADMIN_EMAIL']) { $vars['KHOJ_ADMIN_EMAIL'] = 'brain@localhost' }
if (-not $vars['SUB2API_API_KEY']) { $vars['SUB2API_API_KEY'] = '' }

# 保留已有 Sub2API 配置，覆盖 Personal Brain 相关项
$skip = '^(KHOJ_|SUB2API_API_KEY|CHERRY_STUDIO_|SERVER_PORT=|KHOJ_PORT=|RUN_MODE=)'
$out = @()
if (Test-Path $envFile) { $out = Get-Content $envFile | Where-Object { $_ -notmatch $skip } }
else { $out = @("# Sub2API Personal Brain") }

$out += ""
$out += "# --- Personal Brain (Khoj + Cherry Studio) ---"
$out += "SERVER_PORT=$($vars['SERVER_PORT'])"
$out += "KHOJ_PORT=$($vars['KHOJ_PORT'])"
$out += "RUN_MODE=$($vars['RUN_MODE'])"
$out += "CHERRY_STUDIO_INSTALL_PATH=$($vars['CHERRY_STUDIO_INSTALL_PATH'])"
$out += "SUB2API_API_KEY=$($vars['SUB2API_API_KEY'])"
$out += "KHOJ_ADMIN_EMAIL=$($vars['KHOJ_ADMIN_EMAIL'])"
$out += "KHOJ_ADMIN_PASSWORD=$($vars['KHOJ_ADMIN_PASSWORD'])"
$out += "KHOJ_POSTGRES_USER=$($vars['KHOJ_POSTGRES_USER'])"
$out += "KHOJ_POSTGRES_PASSWORD=$($vars['KHOJ_POSTGRES_PASSWORD'])"
$out += "KHOJ_POSTGRES_DB=$($vars['KHOJ_POSTGRES_DB'])"
$out += "KHOJ_DJANGO_SECRET_KEY=$($vars['KHOJ_DJANGO_SECRET_KEY'])"

Set-Content -Path $envFile -Value ($out -join "`n") -Encoding UTF8

# 停止可能冲突的旧容器（second-brain 栈、已停止的 sub2api 同名容器）
$oldNames = @(
    "sub2api", "sub2api-postgres", "sub2api-redis",
    "second-brain-sub2api", "second-brain-sub2api-postgres", "second-brain-sub2api-redis",
    "second-brain-khoj", "second-brain-khoj-postgres", "second-brain-khoj-sandbox", "second-brain-khoj-search"
)
foreach ($name in $oldNames) {
    $id = docker ps -a --filter "name=^${name}$" --format "{{.ID}}" 2>$null
    if ($id) {
        Write-Host "Remove old container: $name" -ForegroundColor Yellow
        docker rm -f $id 2>$null | Out-Null
    }
}

Write-Host "Pulling images..." -ForegroundColor Cyan
docker compose -f docker-compose.personal.yml pull

Write-Host "Starting stack..." -ForegroundColor Cyan
docker compose -f docker-compose.personal.yml up -d

$port = $vars['SERVER_PORT']
$khojPort = $vars['KHOJ_PORT']
$elapsed = 0
while ($elapsed -lt 180) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$port/health" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { break }
    } catch { }
    Start-Sleep -Seconds 3
    $elapsed += 3
}

# 应用分组（若存在）
$sql = Join-Path (Split-Path $DeployRoot -Parent) "setup_groups.sql"
if (Test-Path $sql) {
    Write-Host "Applying setup_groups.sql..." -ForegroundColor Cyan
    Get-Content $sql -Raw | docker exec -i sub2api-postgres psql -U sub2api -d sub2api 2>$null
}

Write-Host ""
Write-Host "=== Ready ===" -ForegroundColor Green
Write-Host "  Sub2API:  http://localhost:$port"
Write-Host "  Khoj:     http://localhost:$khojPort"
$adminEmail = if ($vars['ADMIN_EMAIL']) { $vars['ADMIN_EMAIL'] } else { 'admin@sub2api.local' }
Write-Host "  Admin:    $adminEmail (see .env)"
Write-Host "  Khoj pwd: $($vars['KHOJ_ADMIN_PASSWORD'])"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Login Sub2API -> add upstream accounts"
Write-Host "  2. Create API Key -> scripts\update-khoj-api-key.ps1 -ApiKey sk-..."
Write-Host "  3. scripts\open-cherry-studio.ps1"
