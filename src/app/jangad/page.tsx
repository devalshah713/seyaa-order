import { isJangadStorageConfigured, listJangadPage, type JangadPage } from "@/lib/jangadStore";
import JangadClient from "./JangadClient";

export const metadata = { title: "Diamond Jangad — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

// The filters live in the address bar, not only in the browser's memory. Two
// reasons: the narrowing is done by the database now, so the server has to know
// what is being asked for; and a refresh, a back button or a bookmarked link
// then keeps the dates and the factory somebody had set.
export default async function JangadPage(props: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; mfg?: string }>;
}) {
  const searchParams = await props.searchParams;
  if (!isJangadStorageConfigured()) {
    return (
      <div className="wrap">
        <div className="page-head"><h1>Diamond Jangad</h1></div>
        <div className="notice">
          Storage isn&rsquo;t configured yet. Set the four <code>R2_*</code>{" "}
          environment variables and redeploy.
        </div>
      </div>
    );
  }

  const filters = {
    q: searchParams.q || "",
    from: searchParams.from || "",
    to: searchParams.to || "",
    mfg: searchParams.mfg || "",
  };

  let page: JangadPage = {
    rows: [], factories: [], cap: 0, more: false, filtered: false,
  };
  let error = "";
  try {
    page = await listJangadPage(filters);
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the register.";
  }

  return (
    <div className="wrap jg-wrap">
      <div className="page-head"><h1>Diamond Jangad</h1></div>
      {error ? (
        <div className="notice">{error}</div>
      ) : (
        <JangadClient
          rows={page.rows}
          factories={page.factories}
          cap={page.cap}
          more={page.more}
          filtered={page.filtered}
          initialQuery={filters.q}
          initialFrom={filters.from}
          initialTo={filters.to}
          initialMfg={filters.mfg}
        />
      )}
    </div>
  );
}
