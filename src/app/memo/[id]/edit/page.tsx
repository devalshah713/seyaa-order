import { notFound } from "next/navigation";
import { getMemo } from "@/lib/memoStore";
import MemoForm from "../../new/MemoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Memo — Seyaa Solitaire" };

export default async function EditMemoPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const memo = await getMemo(params.id).catch(() => null);
  if (!memo) notFound();

  return (
    <MemoForm
      initial={{
        id: memo.id,
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
  );
}
