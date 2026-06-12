# End-to-end smoke test: VPS Sub2API + Cherry config
$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $DeployRoot

$envFile = Join-Path $DeployRoot ".env"
$key = (Select-String -Path $envFile -Pattern '^SUB2API_API_KEY=(.+)$').Matches.Groups[1].Value.Trim()
$base = "https://api.coolapihub.khtain.com"

Write-Host "=== Sub2API integration test ===" -ForegroundColor Cyan
$h = Invoke-RestMethod "$base/health" -TimeoutSec 15
Write-Host "[OK] health:" $h.status

$models = (Invoke-RestMethod "$base/v1/models" -Headers @{ Authorization = "Bearer $key" } -TimeoutSec 30).data
Write-Host "[OK] models:" $models.Count
$models | ForEach-Object { Write-Host "  - $($_.id)" }

$testModel = ($models | Where-Object { $_.id -eq 'claude-sonnet-4-6' } | Select-Object -First 1).id
if (-not $testModel) { $testModel = $models[0].id }

$body = @{
  model = $testModel
  max_tokens = 24
  messages = @(@{ role = "user"; content = "reply ok" })
} | ConvertTo-Json -Depth 5

$chat = Invoke-RestMethod "$base/v1/chat/completions" -Method Post `
  -Headers @{ Authorization = "Bearer $key"; "Content-Type" = "application/json" } `
  -Body $body -TimeoutSec 90
$reply = $chat.choices[0].message.content
Write-Host "[OK] chat ($testModel):" $reply

$cherry = & node (Join-Path $DeployRoot "scripts\read-cherry-persist.mjs") 2>&1 | Out-String
if ($cherry -match 'CoolAPIHub') { Write-Host "[OK] Cherry Studio CoolAPIHub configured" -ForegroundColor Green }
else { Write-Host "[WARN] Cherry CoolAPIHub not found - run configure-cherry-studio.ps1" -ForegroundColor Yellow }

Write-Host "`nProject root: F:\codex\sub2api" -ForegroundColor Gray
Write-Host "VPS deploy:   /opt/sub2api (container sub2api on 127.0.0.1:5801)" -ForegroundColor Gray
