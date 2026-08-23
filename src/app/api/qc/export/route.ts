import { NextResponse } from "next/server";
import { allQcChecks, listQcRecords } from "@/lib/qcStore";
import { buildQcWorkbook } from "@/lib/qcExport";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  try {
    const [records, checks] = await Promise.all([listQcRecords(), allQcChecks()]);
    const buffer = await buildQcWorkbook(records, checks);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="Seyaa QC ${stamp}.xlsx"`,
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
