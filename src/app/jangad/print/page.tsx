import Link from "next/link";
import JangadSlipView from "@/components/JangadSlipView";
import { getJangadRows } from "@/lib/jangadStore";
import type { JangadRow } from "@/lib/jangadConfig";
import AutoPrint from "@/app/AutoPrint";
import PrintActions from "./PrintActions";

export const metadata = { title: "Diamond Issue Slip — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

// ?ids=JG-00001,JG-00002 — the entries picked in the register.
export default async function JangadPrintPage(props: {
  searchParams: Promise<{ ids?: string; pdf?: string; print?: string }>;
}) {
  const searchParams = await props.searchParams;
  const ids = (searchParams.ids || "").split(",").map((s) => s.trim()).filter(Boolean);
  let rows: JangadRow[] = [];
  let error = "";
  if (ids.length) {
    try {
      rows = await getJangadRows(ids);
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not load the entries.";
    }
  }

  // ?pdf=1 hides the action bar, so what is printed is the slip and nothing
  // else. ?print=1 opens the print dialog on arrival.
  const forPdf = searchParams.pdf === "1";
  const autoPrint = searchParams.print === "1";

  if (error || !rows.length) {
    return (
      <div className="wrap">
        <div className="page-head">
          <h1>Diamond Issue Slip</h1>
          <Link href="/jangad" className="btn">← Register</Link>
        </div>
        <div className="notice">
          {error || "Nothing selected to print. Tick the entries in the register first."}
        </div>
      </div>
    );
  }

  return (
    <>
      {autoPrint && <AutoPrint />}
      {!forPdf && (
        <div className="wrap no-print" style={{ paddingBottom: 0 }}>
          <div className="page-head">
            <Link href="/jangad" className="btn">← Register</Link>
            <PrintActions />
          </div>
        </div>
      )}
      <div className="stage">
        <JangadSlipView rows={rows} />
      </div>
    </>
  );
}
