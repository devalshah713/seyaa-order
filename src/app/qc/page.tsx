import { isQcStorageConfigured, listQcRows, type QcRow } from "@/lib/qcStore";
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

  // Rows, not whole records: the table is a client component, so whatever it is
  // given is written into the page, and a record's fifteen checks are two
  // thirds of it. See QcRow.
  let records: QcRow[] = [];
  let error = "";
  try {
    records = await listQcRows();
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
