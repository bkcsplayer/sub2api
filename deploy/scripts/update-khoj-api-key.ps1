# 兼容旧脚本名 -> set-api-key.ps1
param([Parameter(Mandatory=$true)][string]$ApiKey)
& (Join-Path $PSScriptRoot "set-api-key.ps1") -ApiKey $ApiKey
