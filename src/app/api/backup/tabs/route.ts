import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import { isBackupConfigured, tokenOk } from "@/lib/backup";
import { buildAllTabs, istStamp } from "@/lib/sheetBackup";

// Every tab of the backup as plain rows, for something else to write.
//
// The something else is a Google Apps Script living in the office's own sheet:
// it runs as the sheet's owner, on Google's own nightly trigger, so the whole
// Google Cloud side of things — project, service account, key file — is not
// needed at all. The script asks this for the rows and puts them in.
//
// Auth is the backup token the office PC already uses, or an admin's session.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const byToken = isBackupConfigured() && tokenOk(req);
  if (!byToken) {
    const session = await currentSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  try {
    const tabs = await buildAllTabs();
    return NextResponse.json(
      { at: istStamp(), tabs },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the data." },
      { status: 500 }
    );
  }
}
