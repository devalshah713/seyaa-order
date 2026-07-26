# =====================================================================
#  Creates the daily midnight scheduled task for the Seyaa Memo backup.
#  Run this ONCE, in an ADMINISTRATOR PowerShell window, after you have
#  saved backup.ps1 to C:\SeyaaBackups\backup.ps1 and filled in your token.
#  A missed run (PC asleep at midnight) fires as soon as the PC is next on.
# =====================================================================

$ScriptPath = "C:\SeyaaBackups\backup.ps1"

if (-not (Test-Path $ScriptPath)) {
  Write-Error "Put backup.ps1 at $ScriptPath first (with your token filled in)."
  exit 1
}

$action   = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
$trigger  = New-ScheduledTaskTrigger -Daily -At 12:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "Seyaa Memo Backup" `
  -Action $action -Trigger $trigger -Settings $settings `
  -Description "Nightly backup of Seyaa memo data + PDFs to C:\SeyaaBackups" `
  -RunLevel Limited -Force

Write-Host "Done. The task 'Seyaa Memo Backup' will run daily at 12:00 AM."
Write-Host "Test it now with:  Start-ScheduledTask -TaskName 'Seyaa Memo Backup'"
