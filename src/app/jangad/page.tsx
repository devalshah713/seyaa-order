import { isJangadStorageConfigured, listJangad } from "@/lib/jangadStore";
import type { JangadRow } from "@/lib/jangadConfig";
import JangadClient from "./JangadClient";

export const metadata = { title: "Diamond Jangad — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function JangadPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  if (!isJangadStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Diamond Jangad</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Add the <code>BLOB_READ_WRITE_TOKEN</code>{" "}
          environment variable in Vercel and redeploy.
        </div>
      </div>
    );
  }

  let rows: JangadRow[] = [];
  let error = "";
  try {
    rows = await listJangad();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the register.";
  }

  return (
    <div className="wrap jg-wrap">
      <div className="page-head"><h1>Diamond Jangad</h1></div>
      {error ? (
        <div className="notice">{error}</div>
      ) : (
        <JangadClient rows={rows} initialQuery={searchParams.q || ""} />
      )}
    </div>
  );
}
