import { NextRequest, NextResponse } from "next/server";
import { updateMemo, deleteMemo, type MemoItem } from "@/lib/memoStore";
import { parseCodes, PURPOSES } from "@/lib/memoFormat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
function normalizeItems(raw: unknown): MemoItem[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((it) => {
      const src = it as { type?: unknown; stockNos?: unknown };
      const type = typeof src.type === "string" ? src.type : "";
      const codes = Array.isArray(src.stockNos)
        ? parseCodes(src.stockNos.join(","))
        : parseCodes(String(src.stockNos ?? ""));
      return { type, stockNos: codes };
    })
    .filter((it) => it.type || it.stockNos.length > 0);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const items = normalizeItems(body.items);
  if (!items.length) {
    return NextResponse.json(
      { error: "Add at least one item with a type or stock number." },
      { status: 400 }
    );
  }
  const purpose = PURPOSES.includes(body.purpose as (typeof PURPOSES)[number])
    ? (body.purpose as string)
    : PURPOSES[0];

  try {
    const memo = await updateMemo(params.id, {
      to: str(body.to),
      through: str(body.through),
      mobile: str(body.mobile),
      date: str(body.date),
      purpose,
      comment: str(body.comment),
      items,
    });
    if (!memo) return NextResponse.json({ error: "Memo not found." }, { status: 404 });
    return NextResponse.json({ memo });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 503 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const ok = await deleteMemo(params.id);
    if (!ok) return NextResponse.json({ error: "Memo not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 503 });
  }
}
