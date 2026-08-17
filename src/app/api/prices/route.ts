import { NextRequest, NextResponse } from "next/server";
import { loadPrices, normalizePriceList, savePrices } from "@/lib/priceStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ prices: await loadPrices() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the price list." },
      { status: 503 }
    );
  }
}

// The whole list goes back at once. Prices are read live when a piece is
// valued, so saving here re-values everything in stock — which is the point:
// the gold rate moves and the book moves with it.
export async function PUT(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const list = normalizePriceList((body as Record<string, unknown>)?.prices ?? body);
  if (!list.round.length && !list.fancy.length) {
    return NextResponse.json(
      { error: "That would leave the price list empty." },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json({ prices: await savePrices(list) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the price list." },
      { status: 503 }
    );
  }
}
