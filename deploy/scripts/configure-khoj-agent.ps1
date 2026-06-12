# Sync Khoj default agent personality from brain/profile/user-profile.yaml
# Usage: cd deploy && powershell -File scripts\configure-khoj-agent.ps1

$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$profilePath = Join-Path $DeployRoot "brain\profile\user-profile.yaml"

if (-not (Test-Path $profilePath)) {
    throw "Missing $profilePath"
}

$khoj = docker ps --filter "name=^khoj-postgres$" --format "{{.Names}}" 2>$null
if (-not $khoj) {
    throw "khoj-postgres is not running. Start Khoj first: scripts\setup-khoj.ps1"
}

$yaml = Get-Content $profilePath -Raw -Encoding UTF8
$persona = @"
你是用户的第二大脑助手（Khoj Agent）。请用中文回答，先结论后展开。

用户画像与技术栈（来自 user-profile.yaml）：
$yaml

检索知识库时优先引用已沉淀卡片；不确定时明确说明。适合 vibe-coder 场景：代码简洁、最小改动。
"@

$personaSql = $persona.Replace("'", "''")
$sql = @"
UPDATE database_agent
SET personality = '$personaSql',
    name = '第二大脑',
    updated_at = NOW()
WHERE slug = 'khoj';
"@

$sql | docker exec -i khoj-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Host
Write-Host "Khoj agent 'khoj' personality updated from user-profile.yaml" -ForegroundColor Green
