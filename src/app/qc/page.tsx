import { isQcStorageConfigured, listQcRecords } from "@/lib/qcStore";
import type { QcRecord } from "@/lib/qcConfig";
import QcClient from "./QcClient";

export const metadata = { title: "QC — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function QcPage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const searchParams = await props.searchParams;
  if (!isQcStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>QC</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Set the four <code>R2_*</code>{" "}
          environment variables and redeploy.
        </div>
      </div>
    );
  }

  let records: QcRecord[] = [];
  let error = "";
  try {
    records = await listQcRecords();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load QC.";
  }

  return (
    <div className="wrap jg-wrap">
      <div className="page-head"><h1>QC</h1></div>
      {error ? (
        <div className="notice">{error}</div>
      ) : (
        <QcClient records={records} initialQuery={searchParams.q || ""} />
      )}
    </div>
  );
}
