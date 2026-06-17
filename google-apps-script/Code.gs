/**
 * Seyaa Order Management — Google Sheet storage backend (generic).
 *
 * The app sends the column HEADERS and fully-built ROWS; this script fills in
 * Order Number, Date and Status and appends them. Because it is generic, you
 * should NOT need to edit/redeploy it again when fields change in the app.
 *
 * Setup: paste into Extensions → Apps Script of your Sheet, set SECRET, then
 * Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Put the Web App URL + SECRET into Vercel as SHEETS_WEBAPP_URL / SHEETS_TOKEN.
 */

var SECRET = "PASTE_YOUR_SECRET_TOKEN_HERE";

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Orders");
  if (!sh) sh = ss.insertSheet("Orders");
  return sh;
}

function ensureHeaders_(sh, headers) {
  var needsHeader = sh.getLastRow() === 0;
  if (!needsHeader) {
    var existing = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (existing.join("") !== headers.join("")) needsHeader = true;
  }
  if (needsHeader) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
}

function colIndex_(sh, name) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return headers.indexOf(name); // 0-based, -1 if missing
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return json_({ ok: true, service: "seyaa-order-sheet" });
}

function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    if (b.token !== SECRET) return json_({ ok: false, error: "unauthorized" });
    if (b.action === "append") return append_(b.headers, b.rows);
    if (b.action === "list") return list_();
    if (b.action === "updateStatus") return updateStatus_(b.orderNumber, b.status);
    return json_({ ok: false, error: "unknown action" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function nextOrderNumber_(sh) {
  var oc = colIndex_(sh, "Order Number");
  var last = sh.getLastRow();
  var max = 0;
  if (last > 1 && oc >= 0) {
    var col = sh.getRange(2, oc + 1, last - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      var m = String(col[i][0]).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  var n = String(max + 1);
  while (n.length < 4) n = "0" + n;
  return "ORD-" + n;
}

function append_(headers, rows) {
  var sh = getSheet_();
  ensureHeaders_(sh, headers);
  var orderNumber = nextOrderNumber_(sh);
  var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  var oi = headers.indexOf("Order Number");
  var di = headers.indexOf("Date");
  var si = headers.indexOf("Status");
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    if (oi >= 0) row[oi] = orderNumber;
    if (di >= 0) row[di] = date;
    if (si >= 0) row[si] = "NEW";
    sh.appendRow(row);
  }
  return json_({ ok: true, orderNumber: orderNumber });
}

function list_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (last < 1 || lastCol < 1) return json_({ ok: true, headers: [], rows: [] });
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var rows = [];
  if (last > 1) {
    var values = sh.getRange(2, 1, last - 1, lastCol).getValues();
    for (var i = 0; i < values.length; i++) {
      rows.push(values[i].map(function (v) { return v === null ? "" : String(v); }));
    }
  }
  return json_({ ok: true, headers: headers, rows: rows });
}

function updateStatus_(orderNumber, status) {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return json_({ ok: true, updated: 0 });
  var oc = colIndex_(sh, "Order Number");
  var sc = colIndex_(sh, "Status");
  if (oc < 0 || sc < 0) return json_({ ok: false, error: "columns missing" });
  var col = sh.getRange(2, oc + 1, last - 1, 1).getValues();
  var updated = 0;
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(orderNumber)) {
      sh.getRange(i + 2, sc + 1).setValue(status);
      updated++;
    }
  }
  return json_({ ok: true, updated: updated });
}
