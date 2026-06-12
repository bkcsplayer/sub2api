# Approve pending knowledge cards into Khoj
$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir
node approve-pending-deposit.mjs @args
