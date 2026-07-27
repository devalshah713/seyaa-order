import Link from "next/link";
import { listMemos, listEvents, isStorageConfigured, type Memo, type StockEvent } from "@/lib/memoStore";
import HistoryTable from "./HistoryTable";

export const metadata = { title: "Memo History — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  if (!isStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Memo History</h1></div>
        <div className="notice">
          Memo storage isn&rsquo;t configured yet. Add the{" "}
          <code>BLOB_READ_WRITE_TOKEN</code> environment variable in Vercel and redeploy,
          then saved memos will appear here.
        </div>
      </div>
    );
  }

  let memos: Memo[] = [];
  let events: StockEvent[] = [];
  let error = "";
  try {
    [memos, events] = await Promise.all([listMemos(), listEvents()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load memos.";
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Memo History</h1>
        <Link href="/memo/new/gold" className="btn">+ Gold Memo</Link>
        <Link href="/memo/new" className="btn btn-primary">+ New Memo</Link>
      </div>
      {error ? (
        <div className="notice">{error}</div>
      ) : memos.length === 0 ? (
        <div className="empty-state">
          <p>No memos yet. Generate the first one to start keeping track.</p>
          <Link href="/memo/new" className="btn btn-primary">Create a Memo</Link>
        </div>
      ) : (
        <HistoryTable memos={memos} events={events} />
      )}
    </div>
  );
}
