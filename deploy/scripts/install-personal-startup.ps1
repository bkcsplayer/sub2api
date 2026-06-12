# Register login + watchdog tasks: Khoj Docker + Cherry-Khoj bridge (zero-click after boot).
# Run once as your Windows user. Does NOT put passwords in git — reads deploy/.env locally only.
$ErrorActionPreference = "Stop"
$DeployRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnsureScript = Join-Path $DeployRoot "scripts\ensure-brain-services.ps1"
$OpenDashboardBat = Join-Path $DeployRoot "scripts\open-sub2api.bat"
$OpenBrainBat = Join-Path $DeployRoot "scripts\open-brain-dashboard.bat"
$Pwsh = (Get-Command powershell -ErrorAction Stop).Source

function Register-LogonTask {
    param(
        [string]$Name,
        [string]$Description,
        [string]$Arguments,
        [int]$DelaySec = 0
    )

    $existing = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if ($existing) { Unregister-ScheduledTask -TaskName $Name -Confirm:$false }

    $action = New-ScheduledTaskAction -Execute $Pwsh -Argument $Arguments -WorkingDirectory $DeployRoot
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
    if ($DelaySec -gt 0) { $trigger.Delay = "PT${DelaySec}S" }
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask -TaskName $Name -Description $Description -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
    Write-Host "[OK] Logon task: $Name (delay ${DelaySec}s)" -ForegroundColor Green
}

function Register-WatchdogTask {
    param(
        [string]$Name,
        [string]$Description,
        [string]$Arguments
    )

    $existing = Get-ScheduledTask -TaskName $Name -ErrorAction SilentlyContinue
    if ($existing) { Unregister-ScheduledTask -TaskName $Name -Confirm:$false }

    $action = New-ScheduledTaskAction -Execute $Pwsh -Argument $Arguments -WorkingDirectory $DeployRoot
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 10) -RepetitionDuration (New-TimeSpan -Days 3650)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

    Register-ScheduledTask -TaskName $Name -Description $Description -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
    Write-Host "[OK] Watchdog (every 10 min): $Name" -ForegroundColor Green
}

$ensureArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$EnsureScript`""

Write-Host "=== Install Second Brain auto-start (Khoj + Bridge) ===" -ForegroundColor Cyan
Write-Host "Deploy: $DeployRoot"
Write-Host ""
Write-Host "Secrets: keep passwords/API keys ONLY in deploy\.env (gitignored)." -ForegroundColor Yellow
Write-Host "         Vercel coolapihub uses Vercel Environment Variables, not GitHub." -ForegroundColor Yellow
Write-Host ""

# Remove legacy separate tasks if present
foreach ($legacy in @("PersonalBrain-CherryKhojBridge", "PersonalBrain-KhojDocker")) {
    $t = Get-ScheduledTask -TaskName $legacy -ErrorAction SilentlyContinue
    if ($t) {
        Unregister-ScheduledTask -TaskName $legacy -Confirm:$false
        Write-Host "[OK] Removed legacy task: $legacy" -ForegroundColor DarkGray
    }
}

# 1) After login: wait for Docker Desktop, then start Khoj + bridge
Register-LogonTask -Name "PersonalBrain-EnsureServices" `
    -Description "Start Khoj :5871 and Cherry bridge :5892 for Second Brain stack" `
    -Arguments $ensureArgs -DelaySec 25

# 2) Watchdog: restart if either service died
Register-WatchdogTask -Name "PersonalBrain-EnsureServices-Watchdog" `
    -Description "Keep Khoj and Cherry bridge alive (every 10 min)" `
    -Arguments $ensureArgs

# Optional desktop shortcuts (manual open only — services auto-start without clicking)
$desktop = [Environment]::GetFolderPath("Desktop")
$wsh = New-Object -ComObject WScript.Shell

$lnkPath = Join-Path $desktop 'Sub2API Usage Dashboard.lnk'
$sc = $wsh.CreateShortcut($lnkPath)
$sc.TargetPath = $OpenDashboardBat
$sc.WorkingDirectory = Join-Path $DeployRoot "scripts"
$sc.IconLocation = "$env:SystemRoot\System32\imageres.dll,109"
$sc.Description = 'Open coolapihub admin (Vercel)'
$sc.Save()
Write-Host "[OK] Desktop shortcut (optional): Sub2API Usage Dashboard" -ForegroundColor Green

$brainLnk = Join-Path $desktop 'Second Brain Dashboard.lnk'
$sc2 = $wsh.CreateShortcut($brainLnk)
$sc2.TargetPath = $OpenBrainBat
$sc2.WorkingDirectory = Join-Path $DeployRoot "scripts"
$sc2.IconLocation = "$env:SystemRoot\System32\imageres.dll,176"
$sc2.Description = 'Local brain status panel'
$sc2.Save()
Write-Host "[OK] Desktop shortcut (optional): Second Brain Dashboard" -ForegroundColor Green

Write-Host ""
Write-Host "Run ensure now..." -ForegroundColor Yellow
powershell -NoProfile -ExecutionPolicy Bypass -File $EnsureScript

Write-Host ""
Write-Host "Done. After every Windows login (no clicks needed):" -ForegroundColor Green
Write-Host "  - Khoj        http://127.0.0.1:5871"
Write-Host "  - Bridge      http://127.0.0.1:5892  (Cherry Studio + Chrome extension)"
Write-Host "  - Watchdog    checks every 10 minutes"
Write-Host ""
Write-Host "Cherry Studio: point API to bridge once in settings."
Write-Host "Chrome extension: uses bridge when you click; extension loads with Chrome."
