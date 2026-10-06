import Link from "next/link";
import { listPdRows, isPdStorageConfigured, type PdRow } from "@/lib/pdStore";
import PdHistoryTable from "./PdHistoryTable";
import SheetSync from "./SheetSync";

export const metadata = { title: "PD Sheets — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function PdListPage() {
  if (!isPdStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>PD Sheets</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Set the four <code>R2_*</code>{" "}
          environment variables and redeploy.
        </div>
      </div>
    );
  }

  // Rows, not whole sheets: the table is a client component, so everything
  // handed to it is written into the page. See PdRow in pdStore.
  let rows: PdRow[] = [];
  let error = "";
  try {
    rows = await listPdRows();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load PD sheets.";
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>PD Sheets</h1>
        <Link href="/pd/new" className="btn btn-primary">+ New PD Sheet</Link>
      </div>
      <SheetSync />
      {error ? (
        <div className="notice">{error}</div>
      ) : rows.length === 0 ? (
        <div className="empty-state">
          <p>No PD sheets yet. Create the first one for your design team.</p>
          <Link href="/pd/new" className="btn btn-primary">Create a PD Sheet</Link>
        </div>
      ) : (
        <PdHistoryTable rows={rows} />
      )}
    </div>
  );
}
