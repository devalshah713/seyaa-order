# =====================================================================
#  Creates the daily midnight scheduled task for the Seyaa backup.
#  Run this ONCE, in an ADMINISTRATOR PowerShell window, after you have
#  saved backup.ps1 to C:\SeyaaBackups\backup.ps1 and filled in your token.
#  A missed run (PC off at midnight) fires as soon as the PC is next on.
#
#  It asks one question: whether the backup should run even when nobody is
#  signed in. On a machine somebody uses at a desk, no is fine. On a server
#  reached over RDP or AnyDesk, say yes -- otherwise the moment the last
#  session signs out, midnight comes and goes with nothing happening.
# =====================================================================

$ScriptPath = "C:\SeyaaBackups\backup.ps1"

if (-not (Test-Path $ScriptPath)) {
  Write-Error "Put backup.ps1 at $ScriptPath first (with your token filled in)."
  exit 1
}

# An earlier version of this script made the task under its old name. Clear it
# out, or a PC set up back then ends up running the backup twice a night.
$old = Get-ScheduledTask -TaskName "Seyaa Memo Backup" -ErrorAction SilentlyContinue
if ($old) {
  Unregister-ScheduledTask -TaskName "Seyaa Memo Backup" -Confirm:$false
  Write-Host "Removed the older 'Seyaa Memo Backup' task."
}

$action   = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`""
$trigger  = New-ScheduledTaskTrigger -Daily -At 12:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Write-Host ""
Write-Host "Should the backup run even when nobody is signed in to this PC?"
Write-Host "  Y = yes, it is a server or is reached over RDP / AnyDesk (recommended there)"
Write-Host "  N = no, somebody is normally signed in at this desk"
$whenLoggedOff = (Read-Host "Y/N").Trim().ToUpper().StartsWith("Y")

if ($whenLoggedOff) {
  # Windows can only run a task with nobody signed in if it can sign in as
  # somebody itself, which means holding that account's password. It is typed
  # here, on this machine, and goes straight into the Windows task store --
  # never into a file, and never anywhere it can be read back.
  $account = Read-Host "Windows account to run it as (press Enter for $env:USERNAME)"
  if ([string]::IsNullOrWhiteSpace($account)) { $account = $env:USERNAME }

  $secure = Read-Host "Windows password for $account" -AsSecureString
  $bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    Register-ScheduledTask -TaskName "Seyaa Backup" `
      -Action $action -Trigger $trigger -Settings $settings `
      -Description "Nightly backup of the Seyaa portal to C:\SeyaaBackups" `
      -User $account -Password $plain -RunLevel Limited -Force | Out-Null
  } finally {
    # Do not leave the password sitting in memory a moment longer than needed.
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    $plain = $null
    [GC]::Collect()
  }

  Write-Host ""
  Write-Host "Done. 'Seyaa Backup' runs daily at 12:00 AM, signed in or not."
  Write-Host "If you ever change that Windows password, run this script again."
} else {
  Register-ScheduledTask -TaskName "Seyaa Backup" `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description "Nightly backup of the Seyaa portal to C:\SeyaaBackups" `
    -RunLevel Limited -Force | Out-Null

  Write-Host ""
  Write-Host "Done. 'Seyaa Backup' runs daily at 12:00 AM while you are signed in."
  Write-Host "Disconnect your remote session rather than signing out, or it will be skipped."
}

Write-Host ""
Write-Host "Test it right now with:"
Write-Host "  Start-ScheduledTask -TaskName 'Seyaa Backup'"
Write-Host "Then look in C:\SeyaaBackups -- and at backup.log for what happened."
