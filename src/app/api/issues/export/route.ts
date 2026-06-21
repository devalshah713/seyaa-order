import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import { buildDiamondIssueWorkbook } from "@/lib/diamondIssueExport";
import { getCurrentUser } from "@/lib/currentUser";

// Export selected design numbers' diamond issues into the owner's fixed Excel
// template and stream it back as a download.
export async function POST(req: NextRequest) {
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Storage is not connected yet." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const designNumbers: string[] = Array.isArray(body.designNumbers)
    ? body.designNumbers.map((d: unknown) => String(d)).filter(Boolean)
    : [];

  if (!designNumbers.length) {
    return NextResponse.json(
      { error: "Select at least one design number to export." },
      { status: 400 }
    );
  }

  try {
    const buffer = await buildDiamondIssueWorkbook(designNumbers);

    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Exported diamond issue",
        order: designNumbers.length === 1 ? designNumbers[0] : "",
        details: `${designNumbers.length} design(s) to Excel`,
      });
    }

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `Diamond Issue to Manufacturer ${stamp}.xlsx`;
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
