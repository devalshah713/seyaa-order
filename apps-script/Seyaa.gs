/**
 * Seyaa Solitaire — nightly backup into this sheet.
 *
 * Paste this into Extensions → Apps Script on the sheet you want the copy in,
 * then run setUp() once. From then on the sheet fills itself every night.
 *
 * Nothing else is needed: no Google Cloud project, no service account, no key
 * file. The script belongs to this sheet and runs as you, so it already has
 * permission to write here.
 */

// ---- The one thing to change --------------------------------------------
var PORTAL = "https://seyaa-order.vercel.app";
// -------------------------------------------------------------------------

/**
 * Run this once, by hand. It asks for the backup token, keeps it out of the
 * code where nobody can read it over your shoulder, sets the nightly alarm and
 * does the first copy there and then.
 */
function setUp() {
  var ui = SpreadsheetApp.getUi();
  var answer = ui.prompt(
    "Seyaa backup",
    "Paste the backup token (the same one in windows-backup\\backup.ps1):",
    ui.ButtonSet.OK_CANCEL
  );
  if (answer.getSelectedButton() !== ui.Button.OK) return;

  var token = answer.getResponseText().trim();
  if (!token) {
    ui.alert("No token given, so nothing was set up.");
    return;
  }
  PropertiesService.getScriptProperties().setProperty("SEYAA_TOKEN", token);

  scheduleNightly();
  backupNow();
}

/** Midnight, India time, every night. */
function scheduleNightly() {
  // Clear any earlier alarm first, so running setUp() twice does not leave two.
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === "backupNow") {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger("backupNow")
    .timeBased()
    .atHour(0)
    .nearMinute(15)
    .everyDays(1)
    .inTimezone("Asia/Kolkata")
    .create();
}

/**
 * Fetches every module from the portal and writes it into this sheet, one tab
 * each. Each tab is replaced, never added to — so running this twice in a row
 * changes nothing, and an accidental edit in the sheet comes right on the next
 * run.
 */
function backupNow() {
  var token = PropertiesService.getScriptProperties().getProperty("SEYAA_TOKEN");
  if (!token) throw new Error("No token saved yet. Run setUp() first.");

  var res = UrlFetchApp.fetch(PORTAL + "/api/backup/tabs", {
    headers: { "x-backup-token": token },
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  if (code === 401) throw new Error("The portal did not accept that token. Run setUp() again.");
  if (code !== 200) throw new Error("The portal answered " + code + ": " + res.getContentText().slice(0, 200));

  var data = JSON.parse(res.getContentText());
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var log = [["Tab", "Rows", "Result"]];

  for (var i = 0; i < data.tabs.length; i++) {
    var name = data.tabs[i].tab;
    var rows = data.tabs[i].rows || [];
    try {
      writeTab(book, name, rows);
      log.push([name, Math.max(0, rows.length - 1), "OK"]);
    } catch (err) {
      log.push([name, 0, String(err.message || err)]);
    }
  }

  writeTab(book, "Backup Log", [["Last backup", data.at || nowIst()], []].concat(log));
}

/** Replaces one tab's contents, making the tab and its grid big enough first. */
function writeTab(book, name, rows) {
  var sheet = book.getSheetByName(name) || book.insertSheet(name);
  sheet.clear();
  if (!rows.length) return;

  var width = 1;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].length > width) width = rows[i].length;
  }
  // Every row has to be the same length for setValues, and the grid has to be
  // at least that big — QC runs past forty columns, well past the default.
  var square = [];
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r].slice();
    while (row.length < width) row.push("");
    square.push(row);
  }
  if (sheet.getMaxRows() < rows.length) {
    sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows() + 10);
  }
  if (sheet.getMaxColumns() < width) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), width - sheet.getMaxColumns() + 2);
  }

  sheet.getRange(1, 1, square.length, width).setValues(square);
  sheet.getRange(1, 1, 1, width).setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function nowIst() {
  return Utilities.formatDate(new Date(), "Asia/Kolkata", "yyyy-MM-dd HH:mm") + " IST";
}

/** Puts a "Seyaa" menu on the sheet, so a copy can be taken without opening this. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Seyaa")
    .addItem("Back up now", "backupNow")
    .addItem("Set up / change the token", "setUp")
    .addToUi();
}
