import "server-only";
import { listPdSheets } from "./pdStore";
import { parseDesignNo, pieceCount } from "./designNo";
import { isSheetConfigured, writeSheet } from "./googleSheets";

// Every design number the portal has made, in the order somebody would look
// for one: category first, then the number itself. This is what goes into the
// Google Sheet.

export const REGISTER_HEADER = [
  "Design Number",
  "Category",
  "Sub-category",
  "Sub-sub-category",
  "TDW (cts)",
  "Pieces",
  "Product",
  "PD Sheet",
  "Assigned to",
  "Assigned date",
  "Delivery date",
  "Gold",
  "Zone",
  "Dia. quality",
  "Remarks",
];

export async function registerRows(): Promise<string[][]> {
  const sheets = await listPdSheets();
  const rows = sheets.map((s) => {
    const run = parseDesignNo(s.sku);
    const pieces = s.sku.trim() ? pieceCount(run) : 0;
    return [
      s.sku,
      s.category || s.product,
      s.subCategory,
      s.subSubCategory || "",
      s.tdw || "",
      pieces ? String(pieces) : "",
      s.product,
      s.pdNo,
      s.assignedTo,
      s.assignedDate,
      s.deliveryDate,
      [s.goldPurity, s.goldColor].filter(Boolean).join(" "),
      s.zone,
      s.diaQuality,
      s.remarks,
    ];
  });

  rows.sort(
    (a, b) =>
      a[1].localeCompare(b[1]) ||
      a[2].localeCompare(b[2]) ||
      a[0].localeCompare(b[0], undefined, { numeric: true })
  );
  return [REGISTER_HEADER, ...rows];
}

// Pushes the whole register to the sheet. Returns how many design numbers went.
export async function syncDesignRegister(): Promise<number> {
  return writeSheet(await registerRows());
}

// Called after a PD sheet is saved or removed. The sheet is a copy of the
// portal, so falling behind is a nuisance rather than a loss — a failure here
// must never stop a design being saved. The next save, or the Sync button,
// puts it right.
export async function syncDesignRegisterQuietly(): Promise<void> {
  if (!isSheetConfigured()) return;
  try {
    await syncDesignRegister();
  } catch (err) {
    console.error("Design register sync failed:", err instanceof Error ? err.message : err);
  }
}
