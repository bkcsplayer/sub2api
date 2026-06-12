@echo off
cd /d "%~dp0.."
node scripts\generate-quota-cockpit.mjs --force
start "" "%cd%\brain\quota-cockpit.html"
