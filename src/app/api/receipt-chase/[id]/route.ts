import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import {
  closeReceiptChase, getReceiptChase, resumeReceiptChase,
} from "@/lib/receiptChaseStore";
import { remindNow } from "@/lib/receiptChaseRun";

// The four things a person can do to a chase from the screen. Which one is in
// the body, so the buttons all go to the same place.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ACTIONS = ["received", "cancel", "resume", "remind"] as const;
type Action = (typeof ACTIONS)[number];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const action = String(body.action || "") as Action;
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }

  // Whose name goes in the log comes from the session, not the request body.
  const session = await currentSession();
  const by = session?.username || "";
  const id = decodeURIComponent(params.id);

  try {
    if (action === "remind") {
      const report = await remindNow(id, by);
      if (!report) {
        return NextResponse.json({ error: "That chase is already closed." }, { status: 409 });
      }
      const mine = report.outcomes.find((o) => o.id === id);
      return NextResponse.json({ chase: await getReceiptChase(id), note: mine?.note || "" });
    }

    if (action === "resume") {
      const chase = await resumeReceiptChase(id, by);
      if (!chase) {
        return NextResponse.json({ error: "That chase is not paused." }, { status: 409 });
      }
      return NextResponse.json({ chase });
    }

    const detail =
      action === "received"
        ? "Marked as received by hand."
        : "Chase cancelled — these diamonds are not being waited on.";
    const chase = await closeReceiptChase(
      id, action === "received" ? "done" : "cancelled", by, detail
    );
    if (!chase) {
      return NextResponse.json({ error: "That chase is already closed." }, { status: 409 });
    }
    return NextResponse.json({ chase });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not update the chase." },
      { status: 503 }
    );
  }
}
