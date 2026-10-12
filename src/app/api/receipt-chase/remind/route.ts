import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import { remindMany } from "@/lib/receiptChaseRun";

// Remind a whole tickful of designs at once.
//
// This is its own route rather than a loop over /api/receipt-chase/[id] from
// the browser: fifty presses would be fifty reads and fifty writes of the chase
// document, and the free Worker plan gives each request ten milliseconds of
// processor time. One call, one read, one write, one pass.
//
// The literal "remind" segment sits beside the "[id]" one, and the App Router
// always prefers a literal segment over a dynamic one, so this handler takes
// /api/receipt-chase/remind and [id] keeps everything else.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Enough for the whole overdue list in one press, with a ceiling so a stray
// request cannot ask the Worker to rewrite the document for ever.
const MAX_IDS = 200;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = Array.isArray(body.ids) ? body.ids : null;
  if (!raw || !raw.length) {
    return NextResponse.json(
      { error: "Nothing was selected." },
      { status: 400 }
    );
  }
  if (raw.length > MAX_IDS) {
    return NextResponse.json(
      {
        error:
          `That is ${raw.length} designs in one go, and ${MAX_IDS} is the most ` +
          `that can be sent at once. Please select fewer and send them in batches.`,
      },
      { status: 400 }
    );
  }

  // The same id twice would write the same note twice for one press.
  const ids = Array.from(new Set(raw.map((v) => String(v)).filter(Boolean)));
  if (!ids.length) {
    return NextResponse.json({ error: "Nothing was selected." }, { status: 400 });
  }

  // Whose name goes in the log comes from the session, not the request body.
  const session = await currentSession();
  const by = session?.username || "";

  try {
    const { moved, report } = await remindMany(ids, by);
    if (!moved.length || !report) {
      return NextResponse.json(
        { error: "Those chases are already closed." },
        { status: 409 }
      );
    }
    return NextResponse.json({
      moved,
      reminded: report.reminded,
      closed: report.closed,
      note:
        `${report.reminded} ${report.reminded === 1 ? "reminder" : "reminders"} sent` +
        `${report.closed ? `, ${report.closed} found on the jangad and closed` : ""}.`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not send the reminders." },
      { status: 503 }
    );
  }
}
