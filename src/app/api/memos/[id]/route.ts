import { NextRequest, NextResponse } from "next/server";
import { updateMemo, deleteMemo, getMemo, resolveParty } from "@/lib/memoStore";
import { parseMemoBody } from "@/lib/memoInput";
import { assertMemoable } from "@/lib/stockSheet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
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

  // The memo's own kind decides how the body is read — an edit can't move a
  // memo from one book to the other.
  const existing = await getMemo(params.id).catch(() => null);
  if (!existing) return NextResponse.json({ error: "Memo not found." }, { status: 404 });

  const parsed = parseMemoBody(body, existing.kind);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const gate = await assertMemoable(parsed.value.items.flatMap((it) => it.stockNos));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 400 });

  const party = await resolveParty(parsed.value.to);
  if (!party.ok) return NextResponse.json({ error: party.error }, { status: 400 });
  parsed.value.to = party.name;

  try {
    const memo = await updateMemo(params.id, parsed.value);
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
