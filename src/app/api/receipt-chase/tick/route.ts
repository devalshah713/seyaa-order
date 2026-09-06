import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import { isBackupConfigured, tokenOk } from "@/lib/backup";
import { runReceiptTick } from "@/lib/receiptChaseRun";

// The heartbeat of the receipt chase: closes what has turned up on the jangad,
// reminds about what has not. Everything it needs is in the chase rows, so it
// holds no state of its own and can be called as often as anyone likes.
//
// Three callers, the same work each time:
//   * whatever pokes it on a schedule — the Google Apps Script attached to the
//     backup sheet runs every five minutes, with the backup token it already
//     has;
//   * Vercel's own scheduler, once a day, as a floor under that;
//   * an admin pressing "Run the checks now" on the chase screen.
//
// It is deliberately reachable with the backup token: a scheduler has no
// browser and no session.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// A backlog of overdue rows is worked through one at a time, each with a
// webhook post that may retry.
export const maxDuration = 60;

function cronOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}

// Who is asking decides whether quiet hours apply. A scheduler is held to
// them; an admin pressing "Run the checks now" is not, because they are asking
// for it on purpose and may well be clearing a backlog on a Sunday.
async function caller(req: NextRequest): Promise<"scheduler" | "person" | null> {
  if (cronOk(req)) return "scheduler";
  if (isBackupConfigured() && tokenOk(req)) return "scheduler";
  const session = await currentSession();
  return session && session.role === "admin" ? "person" : null;
}

async function run(req: NextRequest): Promise<NextResponse> {
  const who = await caller(req);
  if (!who) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json(
      await runReceiptTick(new Date(), { force: who === "person" })
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not run the chase." },
      { status: 503 }
    );
  }
}

export const GET = run;
export const POST = run;
