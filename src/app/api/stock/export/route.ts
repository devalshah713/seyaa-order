import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import { buildStockWorkbook } from "@/lib/stockExport";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

// Export the Stock Entry log into the owner's fixed Excel template and stream it
// back as a download. Optional ?design= filter (repeatable) limits to designs.
export async function GET(req: NextRequest) {
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage is not connected yet." }, { status: 503 });
  }

  const designs = req.nextUrl.searchParams.getAll("design").map((d) => d.trim()).filter(Boolean);

  try {
    const buffer = await buildStockWorkbook(designs.length ? designs : undefined);

    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Exported stock entry",
        order: designs.length === 1 ? designs[0] : "",
        details: `to Excel${designs.length ? ` · ${designs.length} design(s)` : ""}`,
      });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `Stock Entry ${stamp}.xlsx`;
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
