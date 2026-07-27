import Link from "next/link";
import { notFound } from "next/navigation";
import MemoSheet from "@/components/MemoSheet";
import { getMemo } from "@/lib/memoStore";
import { isDriveConfigured } from "@/lib/googleDrive";
import MemoActions from "./MemoActions";

export const dynamic = "force-dynamic";

export default async function MemoViewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { pdf?: string };
}) {
  const memo = await getMemo(params.id).catch(() => null);
  if (!memo) notFound();

  // ?pdf=1 is the render target used by the PDF generator — no action bar, so
  // it never re-triggers the Drive auto-upload.
  const forPdf = searchParams.pdf === "1";

  return (
    <>
      {!forPdf && (
        <div className="wrap no-print" style={{ paddingBottom: 0 }}>
          <div className="page-head">
            <Link href="/memo" className="btn">← History</Link>
            <MemoActions id={params.id} driveEnabled={isDriveConfigured()} driveLink={memo.driveLink} />
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
    </>
  );
}
