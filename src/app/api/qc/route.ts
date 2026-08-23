import { NextRequest, NextResponse } from "next/server";
import {
  createQcRecord, listQcRecords, normalizeQcInput, piecesForQc, qcSeedForStock,
} from "@/lib/qcStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // ?stock=S0010 is one piece, ready to check: its details and the checks its
    // category calls for.
    const stock = req.nextUrl.searchParams.get("stock");
    if (stock !== null) {
      const seed = await qcSeedForStock(stock);
      if (!seed) {
        return NextResponse.json(
          { error: `Nothing in stock under “${stock}”. QC follows stock-in.` },
          { status: 404 }
        );
      }
      return NextResponse.json({ seed });
    }
    // ?pieces lists everything in stock, so a checker can pick rather than type.
    if (req.nextUrl.searchParams.get("pieces") !== null) {
      return NextResponse.json({ pieces: await piecesForQc() });
    }
    return NextResponse.json({ records: await listQcRecords() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load QC." },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const input = normalizeQcInput(body);
  if (!input.stockNo) {
    return NextResponse.json(
      { error: "A QC record belongs to a stock number." },
      { status: 400 }
    );
  }
  // The piece has to be in stock. Checking something the portal never took in
  // would record a verdict on nothing.
  if (!(await qcSeedForStock(input.stockNo))) {
    return NextResponse.json(
      { error: `${input.stockNo} is not in stock.` },
      { status: 400 }
    );
  }
  if (!input.lines.length) {
    return NextResponse.json(
      { error: "This category has no QC checks yet — an admin adds them under Lists." },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ record: await createQcRecord(input) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the QC." },
      { status: 503 }
    );
  }
}
