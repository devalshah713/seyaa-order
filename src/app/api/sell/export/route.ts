import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import { buildSellSheet } from "@/lib/sellExport";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Export a Sell of Diamonds sheet for the selected stock pieces. Their designs'
// diamond-issue lines are filled into the owner's sell-sheet format and streamed
// back as a download.
export async function GET(req: NextRequest) {
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage is not connected yet." }, { status: 503 });
  }

  const stockNos = req.nextUrl.searchParams.getAll("stock").map((s) => s.trim()).filter(Boolean);
  if (!stockNos.length) {
    return NextResponse.json({ error: "Select at least one stock piece to sell." }, { status: 400 });
  }

  try {
    const buffer = await buildSellSheet(stockNos);

    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Exported sell sheet",
        order: "",
        details: `${stockNos.length} stock piece(s) sold to Excel`,
      });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `Sell Sheet ${stamp}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    console.error("[sell] export failed:", e instanceof Error ? e.stack || e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build sell sheet" },
      { status: 500 }
    );
  }
}
