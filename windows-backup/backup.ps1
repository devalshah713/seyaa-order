# =====================================================================
#  Seyaa Memo — daily backup to this Windows PC
#  Downloads the data file + Excel, and every memo's PDF (incremental),
#  into C:\SeyaaBackups. Scheduled to run daily at midnight.
#  ---------------------------------------------------------------------
#  1) Set the two values below (BASE URL is already filled in).
#  2) Run once by hand to test:  right-click -> Run with PowerShell
#  3) Create the daily task (see the setup guide / register-task.ps1).
# =====================================================================

# ---- EDIT THESE TWO ----
$BaseUrl = "https://seyaa-order.vercel.app"
$Token   = "PASTE_YOUR_BACKUP_TOKEN_HERE"
# ------------------------

$Root = "C:\SeyaaBackups"
$ErrorActionPreference = "Stop"
$today   = Get-Date -Format "yyyy-MM-dd"
$dataDir = Join-Path $Root "data\$today"
# The PDFs and OrderBoards folders are no longer written to (see step 3), but
# whatever they already hold is left exactly where it is.
$logFile = Join-Path $Root "backup.log"
$headers = @{ "x-backup-token" = $Token }

function Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $logFile -Value $line
  Write-Host $line
}

try {
  New-Item -ItemType Directory -Force -Path $Root, $dataDir | Out-Null

  # 1) Restorable data file
  Invoke-WebRequest -Uri "$BaseUrl/api/backup?format=json" -Headers $headers `
    -OutFile (Join-Path $dataDir "data.json") -UseBasicParsing
  Log "Saved data.json"

  # 2) Readable Excel
  Invoke-WebRequest -Uri "$BaseUrl/api/backup?format=xlsx" -Headers $headers `
    -OutFile (Join-Path $dataDir "memos.xlsx") -UseBasicParsing
  Log "Saved memos.xlsx"

  # 2b) The diamond jangad register, in the accounts team's own workbook format
  Invoke-WebRequest -Uri "$BaseUrl/api/backup?format=jangad" -Headers $headers `
    -OutFile (Join-Path $dataDir "diamond-jangad.xlsx") -UseBasicParsing
  Log "Saved diamond-jangad.xlsx"

  # 2c) The stock book, priced at the day's rates
  Invoke-WebRequest -Uri "$BaseUrl/api/backup?format=stockbook" -Headers $headers `
    -OutFile (Join-Path $dataDir "stock-book.xlsx") -UseBasicParsing
  Log "Saved stock-book.xlsx"

  # 2d) The QC register
  Invoke-WebRequest -Uri "$BaseUrl/api/backup?format=qc" -Headers $headers `
    -OutFile (Join-Path $dataDir "qc.xlsx") -UseBasicParsing
  Log "Saved qc.xlsx"

  # 2e) Refresh the Google Sheet copy — every module on its own tab.
  #     Vercel's own scheduler does this nightly too; running it here as well
  #     costs nothing (each tab is replaced, not appended to) and means the
  #     sheet is current whenever this PC has done its backup.
  #     Non-fatal: the sheet is a copy, the files above are the backup.
  try {
    $sheet = Invoke-RestMethod -Uri "$BaseUrl/api/backup/sheets" -Method Post -Headers $headers
    $counts = ($sheet.tabs | ForEach-Object { "{0}: {1}" -f $_.tab, $_.rows }) -join ", "
    Log ("Google Sheet updated -- " + $counts)
  } catch {
    Log ("Google Sheet skipped: " + $_.Exception.Message)
  }

  # 3) PDFs and the order board image — PAUSED.
  #
  #    Both were produced by a browser running on the server, which is a paid
  #    add-on on the portal's new host and was the only thing needing one. The
  #    memo PDF and the order board are now printed and screenshotted from a
  #    real browser instead, so there is nothing here to download.
  #
  #    What is NOT affected: data.json above, which is the restorable backup and
  #    contains every memo in full. A PDF can be reprinted from the portal at
  #    any time; the records are what could not be recreated.
  #
  #    To bring the PDF archive back, the portal needs a way to render one
  #    without a browser on the server. Deleted rather than left half-running so
  #    that this file never reports a backup it did not take.
  Log "PDF archive and order board image: paused (see the note in this script)."

  Log "Backup complete."
}
catch {
  Log ("ERROR: " + $_.Exception.Message)
  exit 1
}
