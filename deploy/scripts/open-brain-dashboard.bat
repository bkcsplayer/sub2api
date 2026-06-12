@echo off
cd /d "%~dp0"
node generate-brain-dashboard.mjs >nul 2>&1
start "" "%~dp0..\brain\dashboard.html"
