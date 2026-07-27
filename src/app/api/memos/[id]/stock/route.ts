// Record what became of individual pieces on a memo. Append-only: this never
// edits an earlier entry, so the audit trail keeps the original alongside any
// later correction.
import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import { recordStockEvents, type NewStockEvent } from "@/lib/memoStore";
import { STOCK_OUTCOMES, parseCodes, type StockOutcome } from "@/lib/memoFormat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID = new Set<string>(STOCK_OUTCOMES.map((o) => o.value));

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  // Who recorded this is part of the trail, so a session is required — the
  // backup token is deliberately not accepted here.
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // One date for the batch — goods normally come back together. Anything that
  // isn't a plain yyyy-mm-dd is dropped so the store falls back to today.
  const rawDate = typeof body.onDate === "string" ? body.onDate.trim() : "";
  const onDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : undefined;

  const raw = Array.isArray(body.entries) ? body.entries : [];
  const entries: NewStockEvent[] = [];
  for (const r of raw) {
    const src = r as { stockNo?: unknown; outcome?: unknown; replacedBy?: unknown; note?: unknown };
    const stockNo = parseCodes(String(src.stockNo ?? ""))[0];
    const outcome = String(src.outcome ?? "");
    if (!stockNo || !VALID.has(outcome)) continue;
    entries.push({
      stockNo,
      outcome: outcome as StockOutcome,
      replacedBy: parseCodes(String(src.replacedBy ?? ""))[0],
      note: typeof src.note === "string" ? src.note.trim().slice(0, 300) : undefined,
      onDate,
    });
  }

  if (!entries.length) {
    return NextResponse.json({ error: "Choose an outcome for at least one piece." }, { status: 400 });
  }

  try {
    const result = await recordStockEvents(params.id, entries, session.username);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, added: result.added });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save." },
      { status: 503 }
    );
  }
}
