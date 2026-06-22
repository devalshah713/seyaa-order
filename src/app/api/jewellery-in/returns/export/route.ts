import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import { listReturns } from "@/lib/diamondReturnStore";
import { buildDiamondReturnWorkbook } from "@/lib/diamondReturnExport";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Export the Diamond Return Log into the owner's fixed Excel template and stream
// it back as a download. Honors the same `q` search filter as the log page, so
// "what you see is what you export". Rows are exported oldest-first (by Sr NO),
// matching the original ledger.
export async function GET(req: NextRequest) {
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage is not connected yet." }, { status: 503 });
  }

  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();

  try {
    let rows = await listReturns(); // oldest-first, as stored
    if (q) {
      rows = rows.filter(
        (r) =>
          r.designNo.toLowerCase().includes(q) ||
          r.shape.toLowerCase().includes(q) ||
          r.size.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
      );
    }

    const buffer = await buildDiamondReturnWorkbook(rows);

    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Exported diamond return log",
        order: "",
        details: `${rows.length} entr${rows.length === 1 ? "y" : "ies"} to Excel${q ? ` · filter "${q}"` : ""}`,
      });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `DIAMOND RETURN FOR PARTY ${stamp}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to build export" },
      { status: 500 }
    );
  }
}
