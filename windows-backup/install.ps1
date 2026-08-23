# =====================================================================
#  Seyaa backup — the whole setup, in one go.
#
#  Double-click INSTALL.bat next to this file. It will:
#    1. make C:\SeyaaBackups
#    2. fetch the backup script
#    3. ask for the backup token, once
#    4. run a backup there and then, so you know it works
#    5. set it to run every night at midnight, and again whenever you
#       sign in — so a night the PC was off is caught up on next time
#
#  No administrator rights. Nothing to edit. Nothing to copy between
#  windows.
# =====================================================================

$ErrorActionPreference = "Stop"
$Root   = "C:\SeyaaBackups"
$Dest   = Join-Path $Root "backup.ps1"
$Source = "https://raw.githubusercontent.com/devalshah713/seyaa-order/main/windows-backup/backup.ps1"

function Say($msg)  { Write-Host $msg }
function Step($msg) { Write-Host ""; Write-Host "== $msg" -ForegroundColor Cyan }
function Bad($msg)  { Write-Host $msg -ForegroundColor Red }
function Good($msg) { Write-Host $msg -ForegroundColor Green }

Write-Host ""
Write-Host "  SEYAA SOLITAIRE - nightly backup setup" -ForegroundColor Yellow
Write-Host "  ---------------------------------------"
Write-Host "  This does not need an administrator password."

# --- 1. The folder ----------------------------------------------------
Step "Making $Root"
try {
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
} catch {
  # A locked-down C:\ is the one thing that can stop this, and the fix is
  # simply to keep the backups under this account's own folder instead.
  $Root = Join-Path $env:USERPROFILE "SeyaaBackups"
  $Dest = Join-Path $Root "backup.ps1"
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  Say "C:\ would not allow it, so the backups will live in $Root instead."
}
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

# The folder may have moved, so make sure the script saves where we decided.
$content = Get-Content $Dest -Raw
$content = $content -replace '(?m)^\$Root\s*=\s*".*"', ('$Root = "' + $Root.Replace('$', '$$') + '"')

# --- 3. The token -----------------------------------------------------
Step "The backup token"
Say "This is the long line you saved in Notepad when you set it in Vercel."
Say "Nothing shows as you paste - right-click in this window to paste."
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
$content = $content -replace '(?m)^\$Token\s*=\s*".*"', ('$Token   = "' + $token.Replace('$', '$$') + '"')
Set-Content -Path $Dest -Value $content -Encoding UTF8
$token = $null

if ((Get-Content $Dest -Raw) -match "PASTE_YOUR_BACKUP_TOKEN_HERE") {
  Bad "The token did not go in. The backup script may be a different version."
  Read-Host "Press Enter to close"
  exit 1
}
Good "Saved into $Dest."

# --- 4. Prove it works before scheduling anything ---------------------
Step "Running a backup now, to check it works"
Say "This takes a minute or two the first time - it fetches every memo PDF."
$run = Start-Process powershell -Wait -PassThru -NoNewWindow -ArgumentList @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`"$Dest`""
)

if ($run.ExitCode -ne 0) {
  Write-Host ""
  Bad "That did not work, so nothing has been scheduled."
  Bad "The last few lines of the log say why:"
  Write-Host ""
  Get-Content (Join-Path $Root "backup.log") -Tail 8 -ErrorAction SilentlyContinue
  Write-Host ""
  Bad "Send those lines over and they will say which part to put right."
  Read-Host "Press Enter to close"
  exit 1
}
Good "Backup worked. Files are in $Root."

# --- 5. Every night, and every time you sign in -----------------------
Step "Setting the timer"

# An older setup made the task under a different name. Clear it, or the
# backup runs twice a night.
try {
  if (Get-ScheduledTask -TaskName "Seyaa Memo Backup" -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName "Seyaa Memo Backup" -Confirm:$false
    Say "Removed the older 'Seyaa Memo Backup' task."
  }
} catch {
  # It belonged to another account and needs rights we have not got. Leaving
  # it is untidy but harmless — it will just fail on its stale token.
  Say "An older task exists under another account; leaving it alone."
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$Dest`""

# Two triggers, which between them cover a PC that is not on at midnight:
# the nightly one, and one for signing in. StartWhenAvailable catches up a
# missed midnight as soon as the machine is next running.
$triggers = @(
  (New-ScheduledTaskTrigger -Daily -At 12:00AM),
  (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME")
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopOnIdleEnd -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

$scheduled = $false
try {
  Register-ScheduledTask -TaskName "Seyaa Backup" `
    -Action $action -Trigger $triggers -Settings $settings `
    -Description "Nightly backup of the Seyaa portal to $Root" `
    -RunLevel Limited -Force | Out-Null
  $scheduled = $true
  Good "Done."
  Say  "  - every night at 12:00 AM"
  Say  "  - and again each time you sign in, so a night the PC was off is caught up"
} catch {
  Bad "Windows would not let this account create a scheduled task:"
  Bad "  $($_.Exception.Message)"
}

if (-not $scheduled) {
  # Last resort, and it still gets the important half: a shortcut in Startup
  # runs the backup every time this account signs in. No rights needed at all.
  Step "Falling back to a shortcut in your Startup folder"
  $startup = [Environment]::GetFolderPath("Startup")
  $lnk = Join-Path $startup "Seyaa Backup.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $s = $shell.CreateShortcut($lnk)
  $s.TargetPath = "powershell.exe"
  $s.Arguments  = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Dest`""
  $s.WorkingDirectory = $Root
  $s.Description = "Backs up the Seyaa portal"
  $s.Save()
  Good "Done. The backup now runs every time you sign in to this PC."
}

Write-Host ""
Write-Host "  ALL SET" -ForegroundColor Green
Write-Host "  Backups land in $Root."
Write-Host "  $Root\backup.log says what happened each time."
Write-Host "  It also refreshes the Google Sheet on every run."
Write-Host ""
Read-Host "Press Enter to close"
