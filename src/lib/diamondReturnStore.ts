// Read/append layer for the "DIAMOND RETURN FOR PARTY" log (the clean record of
// diamonds the factory returns — unused or broken — when jewellery is received).
//
// It uses the SAME Apps Script Web App as everything else. Two actions are
// enough and are already live in production:
//   - "listTab"  → read the whole tab (also used by orders / issues / audit)
//   - "log"      → tab-aware append of one row that also ensures the header row,
//                  exactly how the Activity Log tab is written. The "Diamond
//                  Return" tab is auto-created on the first append, so no Sheet
//                  or Apps Script change is needed.
import { sheetCall } from "./sheetStore";
import { DIAMOND_RETURN_TAB, DIAMOND_RETURN_HEADERS } from "./diamondReturnConfig";

// One returned-diamond line as captured at jewellery-in time.
export type ReturnInput = {
  date: string; // dd/mm/yyyy (blank = today)
  description: string; // "Unused" | "Broken" | free text
  shape: string;
  size: string;
  caratWeight: string;
  pcs: string;
  comments: string;
  designNo: string;
  remark: string;
};

export type ReturnRow = ReturnInput & { srNo: string };

// Google Sheets treats a leading = + - @ as a formula; force plain text. Diamond
// sizes like "+1-1.5 · 1.15 MM" start with +, so they must be escaped.
function escapeCell(v: string): string {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

// Purely-numeric identifiers (e.g. DESIGN NO "001") get coerced by Sheets into a
// number, dropping leading zeros. A leading apostrophe keeps them as text.
function escapeIdCell(v: string): string {
  return /^\d+$/.test(v) ? "'" + v : escapeCell(v);
}

function toObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = r[i] == null ? "" : String(r[i]);
    });
    return o;
  });
}

// Read every logged return (oldest first, as stored). Returns an empty list if
// the tab does not exist yet (nothing returned so far).
export async function listReturns(): Promise<ReturnRow[]> {
  try {
    const data = await sheetCall<{ ok: true; headers: string[]; rows: string[][] }>({
      action: "listTab",
      tab: DIAMOND_RETURN_TAB,
    });
    const objs = toObjects(
      data.headers || (DIAMOND_RETURN_HEADERS as readonly string[]).slice(),
      data.rows || []
    );
    return objs.map((r) => ({
      srNo: r["Sr NO"] || "",
      date: r["Date"] || "",
      description: r["Description"] || "",
      shape: r["Diamond Shape"] || "",
      size: r["Diamond Size"] || "",
      caratWeight: r["Carat Weight"] || "",
      pcs: r["No of pcs"] || "",
      comments: r["Comments"] || "",
      designNo: r["DESIGN NO"] || "",
      remark: r["REMARK"] || "",
    }));
  } catch (e) {
    console.error("[returns] failed to list:", e instanceof Error ? e.message : e);
    return [];
  }
}

// Next Sr NO = (highest existing numeric Sr NO) + 1, so the log stays sequential.
async function nextSrNo(): Promise<number> {
  const existing = await listReturns();
  let max = 0;
  for (const r of existing) {
    const n = parseInt(String(r.srNo).replace(/[^\d]/g, ""), 10);
    if (!isNaN(n)) max = Math.max(max, n);
  }
  return max + 1;
}

function today(): string {
  return new Date().toLocaleDateString("en-GB"); // dd/mm/yyyy
}

// Build one tab row (in DIAMOND_RETURN_HEADERS order) for a return line.
function buildRow(srNo: number, ret: ReturnInput): string[] {
  const get = (header: string): string => {
    switch (header) {
      case "Sr NO":
        return String(srNo);
      case "Date":
        return ret.date || today();
      case "Description":
        return ret.description;
      case "Diamond Shape":
        return ret.shape;
      case "Diamond Size":
        return ret.size;
      case "Carat Weight":
        return ret.caratWeight;
      case "No of pcs":
        return ret.pcs;
      case "Comments":
        return ret.comments;
      case "DESIGN NO":
        return ret.designNo;
      case "REMARK":
        return ret.remark;
    }
    return "";
  };
  return DIAMOND_RETURN_HEADERS.map((h) =>
    h === "DESIGN NO" ? escapeIdCell(get(h)) : escapeCell(get(h))
  );
}

// Append return lines to the "Diamond Return" tab, auto-numbering Sr NO. Rows
// are appended one at a time via the tab-aware "log" action (the same mechanism
// the Activity Log uses), which also creates the tab + headers on first write.
export async function appendReturns(returns: ReturnInput[]): Promise<number> {
  const clean = returns.filter(
    (r) => r.shape || r.size || r.caratWeight || r.pcs || r.description
  );
  if (!clean.length) return 0;

  let srNo = await nextSrNo();
  for (const ret of clean) {
    await sheetCall({
      action: "log",
      tab: DIAMOND_RETURN_TAB,
      headers: DIAMOND_RETURN_HEADERS,
      row: buildRow(srNo, ret),
    });
    srNo += 1;
  }
  return clean.length;
}
