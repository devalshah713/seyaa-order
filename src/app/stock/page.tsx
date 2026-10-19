import Link from "next/link";
import { stockIndex } from "@/lib/memoStore";
import StockClient from "./StockClient";

export const metadata = { title: "Stock Ledger — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default async function StockPage() {
  let rows: Awaited<ReturnType<typeof stockIndex>> = [];
  let error = "";
  try {
    rows = await stockIndex();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not load the ledger.";
  }

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>Stock Ledger</h1>
        <p>Every stock number that has been on a memo, and where it stands now.</p>
        <Link href="/stock/audit" className="btn btn-primary">Audit stock numbers</Link>
      </div>
      <p className="search-note">
        This page is memos only. To see everything the portal knows about a
        piece — the stock book, the jangad register, QC, its PD sheet and the
        Google stock sheet — use <Link href="/stock/audit">Audit stock numbers</Link>.
      </p>
      {error ? (
        <div className="notice">{error}</div>
      ) : rows.length === 0 ? (
        <p className="empty-state">Nothing yet. Stock numbers appear here once they go out on a memo.</p>
      ) : (
        <StockClient rows={rows} />
      )}
    </div>
  );
}
