import { NextRequest, NextResponse } from "next/server";
import { getJangadRows, listJangad } from "@/lib/jangadStore";
import { buildJangadWorkbook } from "@/lib/jangadExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The register in the accounts team's own workbook format.
//
// ?ids=JG-00007,JG-00008 exports just those entries, in the order they were
// asked for — the same shape the print route takes. Without it the whole
// register comes out, which is the right thing for an archive and the wrong
// thing for pasting one design into a sheet.
export async function GET(req: NextRequest): Promise<Response> {
  try {
    const ids = (req.nextUrl.searchParams.get("ids") || "")
      .split(",").map((s) => s.trim()).filter(Boolean)
      // A ceiling so a hand-made URL cannot ask for an unbounded read.
      .slice(0, 2000);
    const rows = ids.length ? await getJangadRows(ids) : await listJangad();
    if (ids.length && !rows.length) {
      return NextResponse.json(
        { error: "None of those entries are in the register." },
        { status: 404 }
      );
    }
    const buffer = await buildJangadWorkbook(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="Diamond Jangad${
          ids.length ? " selected" : ""
        } ${stamp}.xlsx"`,
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
