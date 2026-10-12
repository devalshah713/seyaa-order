import { NextRequest, NextResponse } from "next/server";
import { listMemos, saveMemo } from "@/lib/memoStore";
import { parseMemoBody } from "@/lib/memoInput";
import { assertMemoable } from "@/lib/stockSheet";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ memos: await listMemos() });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 503 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = parseMemoBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // Everything that touches storage goes inside the try. The stock check and
  // the party check used to sit outside it, so a store that could not be
  // reached threw past this handler and the browser was handed the platform's
  // own error page instead of a message. Saving then failed with a complaint
  // about parsing HTML, which says nothing about what went wrong.
  try {
    // Jewellery only — gold memos carry weights, not stock numbers.
    const gate = await assertMemoable(parsed.value.items.flatMap((it) => it.stockNos));
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 400 });

    // One read of the store for the party check and the memo together.
    const saved = await saveMemo(parsed.value);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
    return NextResponse.json({ memo: saved.memo });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 503 });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
