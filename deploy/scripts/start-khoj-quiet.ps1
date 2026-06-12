# Quiet Khoj start for scheduled task
$ErrorActionPreference = 'SilentlyContinue'
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $DeployRoot
docker compose -f docker-compose.khoj.yml up -d 2>&1 | Out-Null
