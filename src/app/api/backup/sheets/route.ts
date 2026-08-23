import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import { isBackupConfigured, tokenOk } from "@/lib/backup";
import { isSheetConfigured, sheetSetupHint, sheetUrl } from "@/lib/googleSheets";
import { istStamp, syncEverythingToSheet } from "@/lib/sheetBackup";

// Rewrites the whole Google Sheet — every module on its own tab.
//
// Three callers, all of them ending in the same work:
//   * Vercel's scheduler, nightly, with the CRON_SECRET it is given;
//   * the office PC's midnight job, with the backup token it already uses;
//   * an admin pressing Sync, with their session.
//
// Safe to run at any time and any number of times: each tab is replaced, not
// appended to.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The sheet is written a tab at a time and there are seven of them.
export const maxDuration = 60;

// Vercel sends `Authorization: Bearer <CRON_SECRET>` on a scheduled request
// when that variable is set.
function cronOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function allowed(req: NextRequest): Promise<boolean> {
  if (cronOk(req)) return true;
  if (isBackupConfigured() && tokenOk(req)) return true;
  const session = await currentSession();
  return !!session && session.role === "admin";
}

async function run(req: NextRequest): Promise<NextResponse> {
  if (!(await allowed(req))) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSheetConfigured()) {
    // A sheet that fills itself from its own Apps Script needs nothing from
    // this route, and the scheduler still calls it every night. Say plainly
    // that there was nothing to do, rather than logging a nightly failure for
    // a setup nobody chose.
    if (cronOk(req)) {
      return NextResponse.json({ at: istStamp(), skipped: "Not set up to push — the sheet fills itself." });
    }
    return NextResponse.json(
      { error: sheetSetupHint() || "The Google Sheet is not set up yet." },
      { status: 501 }
    );
  }

  try {
    const tabs = await syncEverythingToSheet();
    const failed = tabs.filter((t) => t.error);
    return NextResponse.json(
      { at: istStamp(), url: sheetUrl(), tabs, ok: failed.length === 0 },
      // A partly-written sheet is not a success: the nightly job should log it
      // as a failure so somebody looks.
      { status: failed.length ? 502 : 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not write the sheet." },
      { status: 502 }
    );
  }
}

// The scheduler only ever sends GET; the Sync button sends POST.
export const GET = run;
export const POST = run;
