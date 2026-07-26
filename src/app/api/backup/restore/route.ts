import { NextRequest, NextResponse } from "next/server";
import { importDb, type DB } from "@/lib/memoStore";
import { isBackupConfigured, tokenOk } from "@/lib/backup";

// EMERGENCY restore: overwrites the entire database with a previously
// downloaded backup JSON. Guarded by BACKUP_TOKEN AND an explicit
// ?confirm=REPLACE so it can't fire by accident. POST body = the data.json
// contents ({ counters, memos }).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isBackupConfigured()) {
    return NextResponse.json(
      { error: "Backup is not configured. Set BACKUP_TOKEN in Vercel." },
      { status: 501 }
    );
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (req.nextUrl.searchParams.get("confirm") !== "REPLACE") {
    return NextResponse.json(
      { error: "Add ?confirm=REPLACE to confirm overwriting all data." },
      { status: 400 }
    );
  }

  let db: DB;
  try {
    db = (await req.json()) as DB;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!db || typeof db !== "object" || !Array.isArray(db.memos)) {
    return NextResponse.json(
      { error: "Body must be a backup file with a memos array." },
      { status: 400 }
    );
  }

  try {
    await importDb(db);
    return NextResponse.json({ ok: true, restored: db.memos.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Restore failed." },
      { status: 500 }
    );
  }
}
