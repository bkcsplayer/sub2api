# Point Khoj chat models at VPS Sub2API (fixes stale http://sub2api:8080 DB config).
# Usage: cd deploy && powershell -File scripts\configure-khoj-api.ps1

$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$envFile = Join-Path $DeployRoot ".env"

if (-not (Test-Path $envFile)) {
    throw "Missing .env at $envFile"
}

$vars = @{}
foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*([^#=]+)=(.*)$') {
        $vars[$Matches[1].Trim()] = $Matches[2].Trim()
    }
}

$apiUrl = $vars["SUB2API_REMOTE_URL"]
if (-not $apiUrl) { $apiUrl = "https://api.coolapihub.khtain.com/v1/" }
if (-not $apiUrl.EndsWith("/")) { $apiUrl += "/" }

$apiKey = $vars["SUB2API_API_KEY"]
if (-not $apiKey -or $apiKey -eq "replace-me-run-set-api-key") {
    throw "SUB2API_API_KEY is not set in deploy\.env"
}

$khoj = docker ps --filter "name=^khoj-postgres$" --format "{{.Names}}" 2>$null
if (-not $khoj) {
    throw "khoj-postgres is not running. Start Khoj first: scripts\setup-khoj.ps1"
}

# Escape single quotes for SQL
$apiUrlSql = $apiUrl.Replace("'", "''")
$apiKeySql = $apiKey.Replace("'", "''")

$sql = @"
UPDATE database_aimodelapi
SET api_base_url = '$apiUrlSql',
    api_key = '$apiKeySql',
    name = 'Sub2API-Claude',
    updated_at = NOW()
WHERE id = 1;

UPDATE database_chatmodel SET name = 'claude-sonnet-4-6' WHERE id = 1;
UPDATE database_chatmodel SET name = 'claude-opus-4-6' WHERE id = 2;
UPDATE database_chatmodel SET name = 'claude-haiku-4-5' WHERE id = 3;
UPDATE database_chatmodel SET name = 'claude-sonnet-4-5' WHERE id = 4;
"@

$sql | docker exec -i khoj-postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 | Out-Host

Write-Host "Khoj API configured: $apiUrl" -ForegroundColor Green
Write-Host "Default chat model: claude-sonnet-4-6 (Claude API key group)"
