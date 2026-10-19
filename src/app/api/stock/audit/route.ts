import { NextRequest, NextResponse } from "next/server";
import { auditStockNos } from "@/lib/stockAudit";
import { buildStockAuditWorkbook } from "@/lib/stockAuditExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The same audit as the screen, as a file. It is handed the same list in the
// same way, so the file and the screen cannot disagree about what was asked.
//
// This sits under /api/stock, which is the Stock module's own path, so the
// middleware gates it exactly as it gates the screen.
export async function GET(req: NextRequest): Promise<Response> {
  const nos = req.nextUrl.searchParams.get("nos") || "";
  if (!nos.trim()) {
    return NextResponse.json(
      { error: "Give the stock numbers to audit." },
      { status: 400 }
    );
  }

  try {
    const report = await auditStockNos(nos);
    const buffer = await buildStockAuditWorkbook(report);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="Seyaa Stock Audit ${stamp}.xlsx"`,
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
