import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import { createStockEntry, NewStockEntry, StockStone } from "@/lib/stockStore";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Storage is not connected yet. The Google Sheet still needs to be linked." },
      { status: 503 }
    );
  }

  let body: NewStockEntry;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const designNumber = String(body.designNumber || "").trim();
  if (!designNumber) {
    return NextResponse.json({ error: "Design Number is required" }, { status: 400 });
  }

  // Keep only breakup lines that carry at least one value.
  const stones: StockStone[] = (Array.isArray(body.stones) ? body.stones : [])
    .map((s) => ({
      weightBreakup: String(s?.weightBreakup ?? "").trim(),
      pcs: String(s?.pcs ?? "").trim(),
      pointers: String(s?.pointers ?? "").trim(),
      shape: String(s?.shape ?? "").trim(),
      sieveSize: String(s?.sieveSize ?? "").trim(),
      diamondPriceUsd: String(s?.diamondPriceUsd ?? "").trim(),
      diamondPriceInr: String(s?.diamondPriceInr ?? "").trim(),
    }))
    .filter((s) => s.shape || s.sieveSize || s.weightBreakup || s.pcs || s.diamondPriceUsd || s.diamondPriceInr);

  const entry: NewStockEntry = {
    stockNo: body.stockNo ? String(body.stockNo).trim() : "",
    date: String(body.date || "").trim(),
    designName: String(body.designName || "").trim(),
    designNumber,
    location: String(body.location || "").trim(),
    goldDetails: String(body.goldDetails || "").trim(),
    inchSize: String(body.inchSize || "").trim(),
    grossWeight: String(body.grossWeight || "").trim(),
    netWeight: String(body.netWeight || "").trim(),
    manufacturerName: String(body.manufacturerName || "").trim(),
    productCode: String(body.productCode || "").trim(),
    goldPriceUsd: String(body.goldPriceUsd || "").trim(),
    laborUsd: String(body.laborUsd || "").trim(),
    goldPriceInr: String(body.goldPriceInr || "").trim(),
    laborInr: String(body.laborInr || "").trim(),
    comments: String(body.comments || "").trim(),
    stones,
  };

  try {
    const stockNo = await createStockEntry(entry);
    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Stock in",
        order: designNumber,
        details: `Stock ${stockNo} · ${stones.length} breakup line(s)`,
      });
    }
    return NextResponse.json({ ok: true, stockNo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save stock entry" },
      { status: 500 }
    );
  }
}
