import Link from "next/link";
import { notFound } from "next/navigation";
import MemoSheet from "@/components/MemoSheet";
import { getMemo } from "@/lib/memoStore";
import MemoActions from "./MemoActions";

export const dynamic = "force-dynamic";

export default async function MemoViewPage({
  params,
}: {
  params: { id: string };
}) {
  const memo = await getMemo(params.id).catch(() => null);
  if (!memo) notFound();

  return (
    <>
      <div className="wrap no-print" style={{ paddingBottom: 0 }}>
        <div className="page-head">
          <Link href="/memo" className="btn">← History</Link>
          <MemoActions id={params.id} />
        </div>
      </div>
      <div className="stage">
        <MemoSheet
          data={{
            memoNo: memo.memoNo,
            to: memo.to,
            through: memo.through,
            mobile: memo.mobile,
            date: memo.date,
            purpose: memo.purpose,
            comment: memo.comment,
            items: memo.items,
          }}
        />
      </div>
    </>
  );
}
