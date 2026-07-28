import { visibleStock } from "@/lib/stockSheet";
import SheetClient from "./SheetClient";

export const metadata = { title: "Available Stock — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function StockSheetPage() {
  let rows: Awaited<ReturnType<typeof visibleStock>> = [];
  let error = "";
  try {
    rows = await visibleStock();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not read the stock sheets.";
  }

  const ready = rows.filter((r) => r.state === "available").length;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Available Stock</h1>
        <p>
          Live from the stock sheets. Pieces held outside India are not listed.
          {!error && <> <strong>{ready}</strong> of {rows.length} can go out on a memo.</>}
        </p>
      </div>
      {error ? (
        <div className="notice">{error}</div>
      ) : rows.length === 0 ? (
        <p className="empty-state">Nothing to show.</p>
      ) : (
        <SheetClient rows={rows} />
      )}
    </div>
  );
}
