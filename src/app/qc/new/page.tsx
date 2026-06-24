import Link from "next/link";
import QcForm, { QcInitial } from "./QcForm";
import { getQc } from "@/lib/qcStore";

export const dynamic = "force-dynamic";

export default async function NewQcPage({
  searchParams,
}: {
  searchParams: { stock?: string };
}) {
  const stockNo = (searchParams.stock || "").trim();
  const rec = stockNo ? await getQc(stockNo) : null;
  const initial: QcInitial | null = rec ? { ...rec } : null;

  return (
    <main className="container">
      <div style={{ marginBottom: 16 }}>
        <Link href="/qc" className="muted">← QC</Link>
        <h1 style={{ marginTop: 6 }}>{initial ? `Edit QC · Stock ${initial.stockNo}` : "Quality Check"}</h1>
        <p className="muted">Pick a stock number to auto-fetch its details, then run the quality checks.</p>
      </div>
      <QcForm initial={initial} />
    </main>
  );
}
