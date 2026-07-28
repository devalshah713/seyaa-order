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
$pdfDir  = Join-Path $Root "PDFs"
$orderDir = Join-Path $Root "OrderBoards"
$logFile = Join-Path $Root "backup.log"
$headers = @{ "x-backup-token" = $Token }

function Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $logFile -Value $line
  Write-Host $line
}

try {
  New-Item -ItemType Directory -Force -Path $Root, $dataDir, $pdfDir, $orderDir | Out-Null

  # 1) Restorable data file
  Invoke-WebRequest -Uri "$BaseUrl/api/backup?format=json" -Headers $headers `
    -OutFile (Join-Path $dataDir "data.json") -UseBasicParsing
  Log "Saved data.json"

  # 2) Readable Excel
  Invoke-WebRequest -Uri "$BaseUrl/api/backup?format=xlsx" -Headers $headers `
    -OutFile (Join-Path $dataDir "memos.xlsx") -UseBasicParsing
  Log "Saved memos.xlsx"

  # 3) PDFs — only new or edited memos (incremental)
  $data = Get-Content (Join-Path $dataDir "data.json") -Raw | ConvertFrom-Json
  $new = 0; $skip = 0
  foreach ($m in $data.memos) {
    $safe = ($m.memoNo -replace '[\\/:*?"<>|]', '_') + ".pdf"
    $file = Join-Path $pdfDir $safe
    $need = -not (Test-Path $file)
    if (-not $need -and $m.updatedAt) {
      # Both sides in local (IST) time. [datetime] on a "...Z" string already
      # returns local, so the file side must be LastWriteTime -- not
      # LastWriteTimeUtc, which drifts by +5:30 and re-fetches unchanged PDFs.
      if ([datetime]$m.updatedAt -gt (Get-Item $file).LastWriteTime) { $need = $true }
    }
    if ($need) {
      # The PDF route sits behind the login gate too, so send the same token.
      Invoke-WebRequest -Uri "$BaseUrl/api/memos/$($m.id)/pdf" -Headers $headers `
        -OutFile $file -UseBasicParsing
      $new++
    } else { $skip++ }
  }
  Log ("PDFs: {0} downloaded, {1} up-to-date." -f $new, $skip)

  # 4) Order status board as a dated PNG, ready to share on WhatsApp.
  #    Non-fatal: a failure here must not lose the data backup above.
  try {
    Invoke-WebRequest -Uri "$BaseUrl/api/orders/image" -Headers $headers `
      -OutFile (Join-Path $orderDir "orders-$today.png") -UseBasicParsing
    Log "Saved orders-$today.png"
  } catch {
    Log ("Order image skipped: " + $_.Exception.Message)
  }

  Log "Backup complete."
}
catch {
  Log ("ERROR: " + $_.Exception.Message)
  exit 1
}
