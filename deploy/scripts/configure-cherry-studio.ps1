# Configure Cherry Studio to use VPS Sub2API (CoolAPIHub)
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== Configure Cherry Studio -> CoolAPIHub ===" -ForegroundColor Cyan

$running = Get-Process -Name "Cherry Studio" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Closing Cherry Studio..." -ForegroundColor Yellow
    Stop-Process -Name "Cherry Studio" -Force
    Start-Sleep -Seconds 2
}

Push-Location $ScriptDir
try {
    if (-not (Test-Path "node_modules\classic-level")) {
        npm install classic-level --no-save | Out-Null
    }
    node configure-cherry-studio.mjs @args
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    Pop-Location
}

$exe = "E:\cherry-studio\Cherry Studio\Cherry Studio.exe"
if (Test-Path $exe) {
    Write-Host "Starting Cherry Studio..." -ForegroundColor Green
    Start-Process $exe
}

Write-Host "Done. Cherry providers: Claude / OpenAI / DeepSeek / Kimi / Gemini / MiniMax" -ForegroundColor Green
Write-Host "Pick model by provider name prefix 'CoolAPIHub ...' in the model selector." -ForegroundColor Green
