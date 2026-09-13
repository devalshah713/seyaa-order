import Link from "next/link";
import { notFound } from "next/navigation";
import MemoSheet from "@/components/MemoSheet";
import { getMemoWithEvents } from "@/lib/memoStore";
import { linesFor } from "@/lib/memoFormat";
import AutoPrint from "@/app/AutoPrint";
import MemoActions from "./MemoActions";
import StockPanel from "./StockPanel";

export const dynamic = "force-dynamic";

export default async function MemoViewPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pdf?: string; print?: string }>;
}) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const found = await getMemoWithEvents(params.id).catch(() => null);
  if (!found) notFound();
  const { memo, events } = found;
  // Gold moves by weight, so the piece-by-piece return tracking only applies
  // to jewellery memos.
  const lines = memo.kind === "gold" ? [] : linesFor(memo.id, memo.items, events);

  // ?pdf=1 hides the action bar, so what is printed is the sheet and nothing
  // else. ?print=1 opens the print dialog on arrival — that is what the PDF
  // links in the history list do.
  const forPdf = searchParams.pdf === "1";
  const autoPrint = searchParams.print === "1";

  return (
    <>
      {autoPrint && <AutoPrint />}
      {!forPdf && (
        <div className="wrap no-print" style={{ paddingBottom: 0 }}>
          <div className="page-head">
            <Link href="/memo" className="btn">← History</Link>
            <MemoActions id={params.id} />
          </div>
        </div>
      )}
      <div className="stage">
        <MemoSheet
          data={{
            memoNo: memo.memoNo,
            kind: memo.kind,
            to: memo.to,
            through: memo.through,
            mobile: memo.mobile,
            date: memo.date,
            purpose: memo.purpose,
            comment: memo.comment,
            items: memo.items,
            goldItems: memo.goldItems,
            againstMemoNo: memo.againstMemoNo,
          }}
        />
      </div>
      {!forPdf && lines.length > 0 && (
        <div className="wrap no-print">
          <StockPanel memoId={memo.id} lines={lines} />
        </div>
      )}
    </>
  );
}
