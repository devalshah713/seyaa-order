var SECRET = "seyaa-1aafd86bdcbdfdf5c9d7d51f";

function isBlank_(v){ return v===null||v===undefined||String(v).trim()===""; }
function getSheet_(){ var ss=SpreadsheetApp.getActiveSpreadsheet(); var sh=ss.getSheetByName("Orders"); if(!sh) sh=ss.insertSheet("Orders"); return sh; }
function ensureHeaders_(sh, headers){
  var needs = sh.getLastRow()===0;
  if(!needs){ var ex=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; if(ex.join("")!==headers.join("")) needs=true; }
  if(needs){ sh.getRange(1,1,1,headers.length).setValues([headers]); sh.getRange(1,1,1,headers.length).setFontWeight("bold"); sh.setFrozenRows(1); }
}
function colIndex_(sh,name){ var h=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0]; return h.indexOf(name); }
function json_(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function doGet(){ return json_({ ok:true, service:"seyaa-order-sheet" }); }
function doPost(e){
  try{
    var b=JSON.parse(e.postData.contents);
    if(b.token!==SECRET) return json_({ ok:false, error:"unauthorized" });
    if(b.action==="append") return append_(b.headers,b.rows);
    if(b.action==="list") return list_();
    if(b.action==="updateStatus") return updateStatus_(b.orderNumber,b.status);
    if(b.action==="log") return log_(b.tab,b.headers,b.row);
    if(b.action==="listTab") return listTab_(b.tab);
    if(b.action==="replaceByKey") return replaceByKey_(b.tab,b.keyHeader,b.keyValue,b.headers,b.rows);
    if(b.action==="email") return email_(b.to,b.subject,b.body);
    return json_({ ok:false, error:"unknown action" });
  }catch(err){ return json_({ ok:false, error:String(err) }); }
}
function nextOrderNumber_(sh){
  var oc=colIndex_(sh,"Order Number"), last=sh.getLastRow(), max=0;
  if(last>1 && oc>=0){ var col=sh.getRange(2,oc+1,last-1,1).getValues();
    for(var i=0;i<col.length;i++){ var m=String(col[i][0]).match(/(\d+)\s*$/); if(m) max=Math.max(max,parseInt(m[1],10)); } }
  var n=String(max+1); while(n.length<4) n="0"+n; return "ORD-"+n;
}
function append_(headers,rows){
  var sh=getSheet_(); ensureHeaders_(sh,headers);
  var date=Utilities.formatDate(new Date(),Session.getScriptTimeZone(),"yyyy-MM-dd HH:mm");
  var oi=headers.indexOf("Order Number"), di=headers.indexOf("Date"), si=headers.indexOf("Status");
  var auto=null, finalOrderNo="";
  for(var r=0;r<rows.length;r++){ var row=rows[r];
    if(oi>=0){ if(isBlank_(row[oi])){ if(!auto) auto=nextOrderNumber_(sh); row[oi]=auto; } finalOrderNo=row[oi]; }
    if(di>=0 && isBlank_(row[di])) row[di]=date;
    if(si>=0 && isBlank_(row[si])) row[si]="NEW";
    sh.appendRow(row); }
  return json_({ ok:true, orderNumber:finalOrderNo });
}
function list_(){
  var sh=getSheet_(), last=sh.getLastRow(), lastCol=sh.getLastColumn();
  if(last<1||lastCol<1) return json_({ ok:true, headers:[], rows:[] });
  var headers=sh.getRange(1,1,1,lastCol).getValues()[0], rows=[];
  if(last>1){ var v=sh.getRange(2,1,last-1,lastCol).getValues();
    for(var i=0;i<v.length;i++){ rows.push(v[i].map(function(x){return x===null?"":String(x);})); } }
  return json_({ ok:true, headers:headers, rows:rows });
}
function updateStatus_(orderNumber,status){
  var sh=getSheet_(), last=sh.getLastRow();
  if(last<2) return json_({ ok:true, updated:0 });
  var oc=colIndex_(sh,"Order Number"), sc=colIndex_(sh,"Status");
  if(oc<0||sc<0) return json_({ ok:false, error:"columns missing" });
  var col=sh.getRange(2,oc+1,last-1,1).getValues(), updated=0;
  for(var i=0;i<col.length;i++){ if(String(col[i][0])===String(orderNumber)){ sh.getRange(i+2,sc+1).setValue(status); updated++; } }
  return json_({ ok:true, updated:updated });
}
function log_(tabName,headers,row){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var name=tabName||"Activity Log";
  var sh=ss.getSheetByName(name);
  if(!sh){ sh=ss.insertSheet(name); }
  if(sh.getLastRow()===0 && headers && headers.length){
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.getRange(1,1,1,headers.length).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  sh.appendRow(row);
  return json_({ ok:true });
}
function listTab_(tabName){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(tabName);
  if(!sh) return json_({ ok:true, headers:[], rows:[] });
  var last=sh.getLastRow(), lastCol=sh.getLastColumn();
  if(last<1||lastCol<1) return json_({ ok:true, headers:[], rows:[] });
  var headers=sh.getRange(1,1,1,lastCol).getValues()[0], rows=[];
  if(last>1){ var v=sh.getRange(2,1,last-1,lastCol).getValues();
    for(var i=0;i<v.length;i++){ rows.push(v[i].map(function(x){return x===null?"":String(x);})); } }
  return json_({ ok:true, headers:headers, rows:rows });
}
function replaceByKey_(tabName,keyHeader,keyValue,headers,rows){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  var sh=ss.getSheetByName(tabName);
  if(!sh){ sh=ss.insertSheet(tabName); }
  // Keep the header row in sync (handles newly added columns like "Factory").
  if(headers && headers.length){
    var firstRow = sh.getLastRow()===0 ? [] : sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    var same = firstRow.length===headers.length && firstRow.join("")===headers.join("");
    if(!same){
      sh.getRange(1,1,1,headers.length).setValues([headers]);
      sh.getRange(1,1,1,headers.length).setFontWeight("bold");
      sh.setFrozenRows(1);
    }
  }
  var head=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
  var keyCol=head.indexOf(keyHeader);
  if(keyCol>=0 && sh.getLastRow()>1){
    var data=sh.getRange(2,1,sh.getLastRow()-1,sh.getLastColumn()).getValues();
    for(var i=data.length-1;i>=0;i--){
      if(String(data[i][keyCol])===String(keyValue)){ sh.deleteRow(i+2); }
    }
  }
  if(rows && rows.length){
    for(var r=0;r<rows.length;r++){ sh.appendRow(rows[r]); }
  }
  return json_({ ok:true });
}
// Send an email from the script owner's Gmail. Used for QC failure alerts.
// If "to" is blank, it falls back to the owner's address below.
function email_(to,subject,body){
  var recipient=(to && String(to).trim()) ? String(to).trim() : "devalshah713@gmail.com";
  MailApp.sendEmail(recipient, subject||"Notification", body||"");
  return json_({ ok:true });
}
