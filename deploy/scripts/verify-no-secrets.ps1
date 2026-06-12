# Quick scan before git push — fails if deploy/.env or obvious secrets are staged.
$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RepoRoot = Split-Path -Parent $DeployRoot

Push-Location $RepoRoot
try {
    $staged = git diff --cached --name-only 2>$null
    $blocked = @()
    foreach ($f in $staged) {
        if ($f -match '(^|/)\.env$|\.env\.local$|deploy/\.env$') { $blocked += $f }
    }
    if ($blocked.Count -gt 0) {
        Write-Host "BLOCKED: staged secret files:" -ForegroundColor Red
        $blocked | ForEach-Object { Write-Host "  $_" }
        exit 1
    }

    $content = git diff --cached -U0 2>$null
    if ($content -match 'SUB2API_COCKPIT_PASSWORD=\S+' -and $content -notmatch 'change_me|your_') {
        Write-Host "WARN: possible SUB2API_COCKPIT_PASSWORD in staged diff" -ForegroundColor Yellow
    }
    if ($content -match 'sk-[a-f0-9]{20,}') {
        Write-Host "BLOCKED: possible API key (sk-...) in staged diff" -ForegroundColor Red
        exit 1
    }

    Write-Host "OK: no obvious secrets staged for commit." -ForegroundColor Green
} finally {
    Pop-Location
}
