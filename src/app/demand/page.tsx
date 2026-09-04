import Link from "next/link";
import { listDemands, isDemandStorageConfigured, type Demand } from "@/lib/demandStore";
import { openReceiptCount } from "@/lib/receiptChaseStore";
import DemandHistoryTable from "./DemandHistoryTable";

export const metadata = { title: "Diamond Demands — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function DemandListPage() {
  if (!isDemandStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Diamond Demands</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Add the <code>BLOB_READ_WRITE_TOKEN</code>{" "}
          environment variable in Vercel and redeploy.
        </div>
      </div>
    );
  }

  let demands: Demand[] = [];
  let error = "";
  try {
    demands = await listDemands();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load demands.";
  }

  // How many of these are still waiting on their diamonds. Quietly: the list
  // of demands must show whether the chase list can be read or not.
  const waiting = await openReceiptCount().catch(() => 0);

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Diamond Demands</h1>
        <Link href="/demand/receipts" className={waiting ? "btn btn-chase" : "btn"}>
          {waiting ? `Awaiting diamonds ${waiting}` : "Diamond receipts"}
        </Link>
        <Link href="/demand/new" className="btn btn-primary">+ New Demand</Link>
      </div>
      {error ? (
        <div className="notice">{error}</div>
      ) : demands.length === 0 ? (
        <div className="empty-state">
          <p>No diamond demands yet. Raise one from a PD sheet, or create a blank one.</p>
          <Link href="/demand/new" className="btn btn-primary">Create a Demand</Link>
        </div>
      ) : (
        <DemandHistoryTable demands={demands} />
      )}
    </div>
  );
}
