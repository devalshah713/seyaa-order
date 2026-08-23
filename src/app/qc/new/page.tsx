import Link from "next/link";
import { currentSession } from "@/lib/currentUser";
import { isQcStorageConfigured, piecesForQc, type QcSeed } from "@/lib/qcStore";
import QcForm from "../QcForm";

export const metadata = { title: "Check a piece — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function NewQcPage() {
  if (!isQcStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Check a piece</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Add the <code>BLOB_READ_WRITE_TOKEN</code>{" "}
          environment variable in Vercel and redeploy.
        </div>
      </div>
    );
  }

  const session = await currentSession();
  let pieces: QcSeed[] = [];
  let error = "";
  try {
    pieces = await piecesForQc();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load what is in stock.";
  }

  return (
    <div className="wrap jg-wrap">
      <div className="page-head">
        <h1>Check a piece</h1>
        <Link href="/qc" className="btn">← QC register</Link>
      </div>
      {error ? (
        <div className="notice">{error}</div>
      ) : (
        <QcForm pieces={pieces} who={session?.username || ""} />
      )}
    </div>
  );
}
