/**
 * Seyaa Order Management — Google Sheet storage backend.
 *
 * This Apps Script turns a Google Sheet into the storage for the order app.
 * Paste it into Extensions → Apps Script of your Google Sheet, set the
 * SECRET below, then Deploy → New deployment → Web app (Execute as: Me,
 * Who has access: Anyone). Give the resulting Web App URL + the SECRET to
 * the app (Vercel environment variables SHEETS_WEBAPP_URL and SHEETS_TOKEN).
 */

// IMPORTANT: replace this with the secret token you were given, and use the
// exact same value for SHEETS_TOKEN in Vercel.
var SECRET = "PASTE_YOUR_SECRET_TOKEN_HERE";

// Column order of the Orders sheet. Must match the app's configuration.
var HEADERS = [
  "Order Number",
  "Date",
  "Status",
  "Region",
  "Customer Name",
  "Product Type",
  "Quantity",
  "Gold Color",
  "Gold Karat",
  "Length",
  "Diamond Shape",
  "Diamond Size",
  "Number of Diamonds",
  "Stone Type",
  "Stone Color",
  "Certificate Number",
  "Metal Weight (Approx)",
  "Notes"
];

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Orders");
  if (!sh) sh = ss.insertSheet("Orders");
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// Health check (visiting the URL in a browser).
function doGet() {
  return json_({ ok: true, service: "seyaa-order-sheet" });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.token !== SECRET) return json_({ ok: false, error: "unauthorized" });

    if (body.action === "append") return append_(body.order);
    if (body.action === "list") return list_();
    if (body.action === "updateStatus") return updateStatus_(body.orderNumber, body.status);
    return json_({ ok: false, error: "unknown action" });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// Next sequential order number, e.g. ORD-0007.
function nextOrderNumber_(sh) {
  var last = sh.getLastRow();
  var max = 0;
  if (last > 1) {
    var col = sh.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < col.length; i++) {
      var m = String(col[i][0]).match(/(\d+)\s*$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
  }
  var n = String(max + 1);
  while (n.length < 4) n = "0" + n;
  return "ORD-" + n;
}

function append_(order) {
  var sh = getSheet_();
  var orderNumber = nextOrderNumber_(sh);
  var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  var status = "NEW";

  var items = order.items || [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var row = HEADERS.map(function (h) {
      if (h === "Order Number") return orderNumber;
      if (h === "Date") return date;
      if (h === "Status") return status;
      if (h === "Region") return order.region || "";
      if (h === "Customer Name") return order.customerName || "";
      if (h === "Notes") return order.notes || "";
      return item[h] != null ? item[h] : ""; // Product Type, Quantity, spec fields
    });
    sh.appendRow(row);
  }
  return json_({ ok: true, orderNumber: orderNumber });
}

function list_() {
  var sh = getSheet_();
  var last = sh.getLastRow();
  var rows = [];
  if (last > 1) {
    var values = sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
    for (var i = 0; i < values.length; i++) {
      var obj = {};
      for (var c = 0; c < HEADERS.length; c++) {
        obj[HEADERS[c]] = values[i][c] === null ? "" : String(values[i][c]);
      }
      rows.push(obj);
    }
  }
  return json_({ ok: true, rows: rows });
}

function updateStatus_(orderNumber, status) {
  var sh = getSheet_();
  var last = sh.getLastRow();
  if (last < 2) return json_({ ok: true, updated: 0 });
  var statusCol = HEADERS.indexOf("Status") + 1;
  var col = sh.getRange(2, 1, last - 1, 1).getValues();
  var updated = 0;
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]) === String(orderNumber)) {
      sh.getRange(i + 2, statusCol).setValue(status);
      updated++;
    }
  }
  return json_({ ok: true, updated: updated });
}
