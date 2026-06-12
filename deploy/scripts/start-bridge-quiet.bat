@echo off
REM Login-task entry: start bridge with port cleanup (delegates to PowerShell)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start-cherry-bridge.ps1"
