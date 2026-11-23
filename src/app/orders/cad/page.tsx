import Link from "next/link";
import { listCadRows } from "@/lib/memoStore";
import type { CadRow } from "@/lib/cadConfig";
import { currentSession } from "@/lib/currentUser";
import CadClient from "./CadClient";

export const metadata = { title: "CAD Requests — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function CadRequestsPage() {
  // Read first and unconditionally, so this page is always rendered per
  // request. See currentSession().
  const session = await currentSession();
  const isAdmin = session?.role === "admin";

  // The list's own columns, never the requests whole. A store that cannot be
  // read says so; it is never shown as an empty book.
  let rows: CadRow[] = [];
  let error = "";
  try {
    rows = await listCadRows();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the CAD requests.";
  }

  const withFactory = rows.filter((r) => r.status === "sent" || r.status === "changes").length;
  const toDecide = rows.filter((r) => r.status === "received").length;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>CAD Requests</h1>
        {!error && (
          <p>
            {rows.length} total · {withFactory} with the factory
            {toDecide > 0 && (
              <> · {toDecide} {isAdmin ? "waiting for your approval" : "with the owner"}</>
            )}
          </p>
        )}
        <Link href="/orders" className="btn">← All orders</Link>
        <Link href="/orders/cad/new" className="btn btn-primary">New CAD request</Link>
      </div>
      {error ? (
        <div className="notice">
          The CAD requests could not be read, so nothing is shown. {error}
        </div>
      ) : (
        <>
          <p className="hint">
            Raise the request here first, then send it to the factory on WhatsApp
            from its own page.
            <br />
            When the CAD comes back, put it on the request. The owner approves it,
            and then it can become an order.
          </p>
          <CadClient
            rows={rows}
            me={{ username: session?.username || "", isAdmin }}
          />
        </>
      )}
    </div>
  );
}
