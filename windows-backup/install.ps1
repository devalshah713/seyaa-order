# =====================================================================
#  Seyaa backup — the whole setup, in one go.
#
#  Double-click INSTALL.bat next to this file. It will:
#    1. make C:\SeyaaBackups
#    2. fetch the backup script
#    3. ask for the backup token, once
#    4. run a backup there and then, so you know it works
#    5. set it to run every night at midnight
#
#  Nothing to edit, nothing to copy between windows.
# =====================================================================

$ErrorActionPreference = "Stop"
$Root   = "C:\SeyaaBackups"
$Dest   = Join-Path $Root "backup.ps1"
$Source = "https://raw.githubusercontent.com/devalshah713/seyaa-order/main/windows-backup/backup.ps1"

function Say($msg)  { Write-Host $msg }
function Step($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }
function Bad($msg)  { Write-Host $msg -ForegroundColor Red }
function Good($msg) { Write-Host $msg -ForegroundColor Green }

# Registering a scheduled task needs administrator, so ask Windows for it
# rather than making somebody know to right-click.
$me = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $me.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Say "Asking Windows for administrator rights..."
  Start-Process powershell -Verb RunAs -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$PSCommandPath`""
  )
  exit
}

Write-Host ""
Write-Host "  SEYAA SOLITAIRE - nightly backup setup" -ForegroundColor Yellow
Write-Host "  ---------------------------------------"

# --- 1. The folder ----------------------------------------------------
Step "Making $Root"
New-Item -ItemType Directory -Force -Path $Root | Out-Null
Good "Ready."

# --- 2. The backup script ---------------------------------------------
Step "Getting the backup script"
$beside = Join-Path $PSScriptRoot "backup.ps1"
if (Test-Path $beside) {
  # A copy sitting next to the installer wins: it is what was actually sent.
  Copy-Item $beside $Dest -Force
  Good "Copied the one next to this installer."
} else {
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $Source -OutFile $Dest -UseBasicParsing
    Good "Downloaded."
  } catch {
    Bad "Could not download it: $($_.Exception.Message)"
    Bad "Put backup.ps1 in the same folder as this installer and run it again."
    Read-Host "Press Enter to close"
    exit 1
  }
}

# --- 3. The token -----------------------------------------------------
Step "The backup token"
Say "This is the long line you saved in Notepad when you set it in Vercel."
Say "Nothing is shown as you paste - right-click in this window to paste."
$secure = Read-Host "Paste the token" -AsSecureString
$bstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($token)) {
  Bad "No token given, so nothing was set up. Run the installer again."
  Read-Host "Press Enter to close"
  exit 1
}

# A $ in the token would be read as a capture group by -replace, so it is
# doubled on the way in.
$safe    = $token.Replace('$', '$$')
$content = Get-Content $Dest -Raw
$content = $content -replace '(?m)^\$Token\s*=\s*".*"', ('$Token   = "' + $safe + '"')
Set-Content -Path $Dest -Value $content -Encoding UTF8

if ((Get-Content $Dest -Raw) -match "PASTE_YOUR_BACKUP_TOKEN_HERE") {
  Bad "The token did not go in. The backup script may be a different version."
  Read-Host "Press Enter to close"
  exit 1
}
Good "Saved into $Dest."
$token = $null

# --- 4. Prove it works before scheduling anything ---------------------
Step "Running a backup now, to check it works"
Say "This takes a minute or two the first time - it fetches every memo PDF."
$run = Start-Process powershell -Wait -PassThru -NoNewWindow -ArgumentList @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$Dest`""
)

if ($run.ExitCode -ne 0) {
  Write-Host ""
  Bad "That did not work, so the nightly job has NOT been set up."
  Bad "The last few lines of the log say why:"
  Write-Host ""
  Get-Content (Join-Path $Root "backup.log") -Tail 8 -ErrorAction SilentlyContinue
  Write-Host ""
  Bad "Send those lines over and they will say which part to put right."
  Read-Host "Press Enter to close"
  exit 1
}
Good "Backup worked. Files are in $Root."

# --- 5. Every night at midnight ---------------------------------------
Step "Setting it to run every night at 12:00 AM"

# An older setup made the task under a different name. Clear it, or the
# backup runs twice a night.
if (Get-ScheduledTask -TaskName "Seyaa Memo Backup" -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName "Seyaa Memo Backup" -Confirm:$false
  Say "Removed the older 'Seyaa Memo Backup' task."
}

$action   = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Dest`""
$trigger  = New-ScheduledTaskTrigger -Daily -At 12:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Say ""
Say "Is this a PC somebody is normally signed in to, or a server you connect to?"
Say "  S = a server, reached over RDP or AnyDesk  (backup runs even with nobody signed in)"
Say "  D = a desk PC                              (backup runs while you are signed in)"
$answer = (Read-Host "S/D").Trim().ToUpper()

if ($answer.StartsWith("D")) {
  Register-ScheduledTask -TaskName "Seyaa Backup" `
    -Action $action -Trigger $trigger -Settings $settings `
    -Description "Nightly backup of the Seyaa portal to C:\SeyaaBackups" `
    -RunLevel Limited -Force | Out-Null
  Good "Done - it runs at midnight while you are signed in."
  Say  "Disconnect your session rather than signing out, or it gets skipped."
} else {
  Say ""
  Say "Windows can only run something with nobody signed in if it can sign in"
  Say "as somebody itself. Your Windows password stays on this PC - it goes"
  Say "straight into the Windows task store and into no file."
  $account = Read-Host "Windows account (press Enter for $env:USERNAME)"
  if ([string]::IsNullOrWhiteSpace($account)) { $account = $env:USERNAME }

  $pwSecure = Read-Host "Windows password for $account" -AsSecureString
  $pwBstr   = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pwSecure)
  try {
    $pwPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($pwBstr)
    Register-ScheduledTask -TaskName "Seyaa Backup" `
      -Action $action -Trigger $trigger -Settings $settings `
      -Description "Nightly backup of the Seyaa portal to C:\SeyaaBackups" `
      -User $account -Password $pwPlain -RunLevel Limited -Force | Out-Null
  } catch {
    Bad "Windows would not accept that account or password: $($_.Exception.Message)"
    Bad "The backup script is installed and works - only the nightly timer is missing."
    Bad "Run this installer again to have another go at it."
    Read-Host "Press Enter to close"
    exit 1
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pwBstr)
    $pwPlain = $null
    [GC]::Collect()
  }
  Good "Done - it runs at midnight whether anyone is signed in or not."
  Say  "If you ever change that Windows password, run this installer again."
}

Write-Host ""
Write-Host "  ALL SET" -ForegroundColor Green
Write-Host "  Backups land in $Root every night at midnight."
Write-Host "  $Root\backup.log says what happened each time."
Write-Host "  It also refreshes the Google Sheet on every run."
Write-Host ""
Read-Host "Press Enter to close"
