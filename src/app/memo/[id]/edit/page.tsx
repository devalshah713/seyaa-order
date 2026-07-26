import { notFound } from "next/navigation";
import { getMemo } from "@/lib/memoStore";
import MemoForm from "../../new/MemoForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit Memo — Seyaa Solitaire" };

export default async function EditMemoPage({ params }: { params: { id: string } }) {
  const memo = await getMemo(params.id).catch(() => null);
  if (!memo) notFound();

  return (
    <MemoForm
      initial={{
        id: memo.id,
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
  );
}
