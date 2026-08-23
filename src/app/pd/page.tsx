import Link from "next/link";
import { listPdSheets, isPdStorageConfigured, type PdSheet } from "@/lib/pdStore";
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
          Storage isn&rsquo;t configured yet. Add the <code>BLOB_READ_WRITE_TOKEN</code>{" "}
          environment variable in Vercel and redeploy.
        </div>
      </div>
    );
  }

  let sheets: PdSheet[] = [];
  let error = "";
  try {
    sheets = await listPdSheets();
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
      ) : sheets.length === 0 ? (
        <div className="empty-state">
          <p>No PD sheets yet. Create the first one for your design team.</p>
          <Link href="/pd/new" className="btn btn-primary">Create a PD Sheet</Link>
        </div>
      ) : (
        <PdHistoryTable sheets={sheets} />
      )}
    </div>
  );
}
