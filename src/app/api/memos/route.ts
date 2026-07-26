import { NextRequest, NextResponse } from "next/server";
import { createMemo, listMemos, type MemoItem } from "@/lib/memoStore";
import { parseCodes, PURPOSES } from "@/lib/memoFormat";

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

  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items: MemoItem[] = rawItems
    .map((it) => {
      const src = it as { type?: unknown; stockNos?: unknown };
      const type = typeof src.type === "string" ? src.type : "";
      // Accept either a pre-split array or a raw string and normalise both.
      const codes = Array.isArray(src.stockNos)
        ? parseCodes(src.stockNos.join(","))
        : parseCodes(String(src.stockNos ?? ""));
      return { type, stockNos: codes };
    })
    .filter((it) => it.type || it.stockNos.length > 0);

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
    const memo = await createMemo({
      to: str(body.to),
      through: str(body.through),
      mobile: str(body.mobile),
      date: str(body.date),
      purpose,
      comment: str(body.comment),
      items,
    });
    return NextResponse.json({ memo });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 503 });
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function message(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
