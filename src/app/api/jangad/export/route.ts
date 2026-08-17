import { NextRequest, NextResponse } from "next/server";
import { listJangad } from "@/lib/jangadStore";
import { buildJangadWorkbook } from "@/lib/jangadExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The register in the accounts team's own workbook format.
export async function GET(_req: NextRequest): Promise<Response> {
  try {
    const rows = await listJangad();
    const buffer = await buildJangadWorkbook(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="Diamond Jangad ${stamp}.xlsx"`,
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
