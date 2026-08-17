import { NextRequest, NextResponse } from "next/server";
import {
  createStockEntry, listStockEntries, nextStockNo, normalizeStockInput,
  piecesForStock, seedFromDesign,
} from "@/lib/stockBookStore";
import { loadPrices } from "@/lib/priceStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // ?design=<design or piece number> answers with everything that number
    // already knows — the PD sheet, the demand, the issue — for a piece the
    // register never saw. Nothing is saved.
    const design = req.nextUrl.searchParams.get("design");
    if (design !== null) {
      const seed = await seedFromDesign(design);
      if (!seed) {
        return NextResponse.json(
          { error: `Nothing found under “${design}”.` },
          { status: 404 }
        );
      }
      return NextResponse.json({ seed });
    }

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
