import { NextRequest, NextResponse } from "next/server";
import { exportDb } from "@/lib/memoStore";
import { exportPdDb } from "@/lib/pdStore";
import { exportDemandDb } from "@/lib/demandStore";
import { buildMemoWorkbook } from "@/lib/memoExport";
import { isBackupConfigured, tokenOk } from "@/lib/backup";

// Secret-protected backup download for the user's own PC to pull nightly.
//   ?format=json  -> full restorable database (counters + memos)
//   ?format=xlsx  -> readable Excel of all memos
// Auth: `x-backup-token` header or `?token=` must equal BACKUP_TOKEN.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  if (!isBackupConfigured()) {
    return NextResponse.json(
      { error: "Backup is not configured. Set BACKUP_TOKEN in Vercel." },
      { status: 501 }
    );
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    if (format === "xlsx") {
      const db = await exportDb();
      const buffer = await buildMemoWorkbook(db.memos, db.events);
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="Seyaa Memos ${stamp}.xlsx"`,
          "cache-control": "no-store",
        },
      });
    }

    // Default: JSON — the restorable database (memos + PD sheets). `memos` and
    // `counters` stay at the top level so existing backups/restores keep working.
    const db = await exportDb();
    const pd = await exportPdDb().catch(() => ({ counters: {}, sheets: [] }));
    const demand = await exportDemandDb().catch(() => ({ counters: {}, demands: [] }));
    return new NextResponse(JSON.stringify({ ...db, pd, demand }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="seyaa-memos-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backup failed." },
      { status: 500 }
    );
  }
}
