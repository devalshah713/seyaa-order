import { NextRequest, NextResponse } from "next/server";
import { listStockEntries } from "@/lib/stockBookStore";
import { loadPrices } from "@/lib/priceStore";
import { buildStockWorkbook } from "@/lib/stockBookExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The stock book in the company's own workbook format: the price list, STOCK,
// and the lines of every multi-stone piece.
export async function GET(_req: NextRequest): Promise<Response> {
  try {
    const [entries, prices] = await Promise.all([listStockEntries(), loadPrices()]);
    const buffer = await buildStockWorkbook(entries, prices);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="Seyaa Stock ${stamp}.xlsx"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build the file." },
      { status: 503 }
    );
  }
}
