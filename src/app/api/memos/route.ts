import { NextRequest, NextResponse } from "next/server";
import { createMemo, listMemos } from "@/lib/memoStore";
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

  // Jewellery only — gold memos carry weights, not stock numbers.
  const gate = await assertMemoable(parsed.value.items.flatMap((it) => it.stockNos));
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 400 });

  try {
    return NextResponse.json({ memo: await createMemo(parsed.value) });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 503 });
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
