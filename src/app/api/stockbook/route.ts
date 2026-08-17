import { NextRequest, NextResponse } from "next/server";
import {
  createStockEntry, listStockEntries, nextStockNo, normalizeStockInput,
  piecesForStock,
} from "@/lib/stockBookStore";
import { loadPrices } from "@/lib/priceStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // ?pieces returns every piece the jangad register knows about, with its
    // diamond lines already gathered — what a new entry starts from.
    if (req.nextUrl.searchParams.get("pieces") !== null) {
      const [pieces, stockNo, prices] = await Promise.all([
        piecesForStock(), nextStockNo(), loadPrices(),
      ]);
      return NextResponse.json({ pieces, stockNo, prices });
    }
    return NextResponse.json({ entries: await listStockEntries() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the stock book." },
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

  const input = normalizeStockInput(body);
  if (!input.designNo && !input.design) {
    return NextResponse.json(
      { error: "A stock entry needs at least a design number." },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ entry: await createStockEntry(input) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the entry." },
      { status: 503 }
    );
  }
}
