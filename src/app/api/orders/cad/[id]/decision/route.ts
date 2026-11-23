// The owner's decision on a CAD: approve it, or ask for changes.
//
// The owner's alone, checked here on the signed session and not only by hiding
// the buttons. Asking for changes needs the change in words, because that note
// is what goes to the factory.
import { NextRequest, NextResponse } from "next/server";
import { changeCadRequest } from "@/lib/memoStore";
import { canDecideCad } from "@/lib/cadConfig";
import { currentSession } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Only the owner can approve a CAD or ask for changes." },
      { status: 403 }
    );
  }
  const me = { username: session.username, isAdmin: true };
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const decision = body.decision === "approve" ? "approve" : body.decision === "changes" ? "changes" : "";
  if (!decision) {
    return NextResponse.json({ error: "Choose Approve or Ask for changes." }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (decision === "changes" && !note) {
    return NextResponse.json(
      { error: "Write what the factory should change." },
      { status: 400 }
    );
  }

  try {
    const done = await changeCadRequest(
      id,
      () =>
        decision === "approve"
          ? { status: "approved", changeNote: "" }
          : { status: "changes", changeNote: note },
      {
        action: decision === "approve" ? "approved" : "changes",
        by: session.username,
        ...(note ? { note } : {}),
      },
      (r) => {
        if (canDecideCad(r, me, decision)) return "";
        if (r.status === "ordered") return `${r.cadNo} already became an order.`;
        if ((r.cadImages || []).length === 0) {
          return "No CAD has come back on this one yet, so there is nothing to decide.";
        }
        if (r.status === "approved") return `${r.cadNo} is already approved.`;
        return "The changes asked have not come back from the factory yet.";
      }
    );
    if (!done) return NextResponse.json({ error: "CAD request not found." }, { status: 404 });
    if ("refused" in done) return NextResponse.json({ error: done.refused }, { status: 409 });
    return NextResponse.json({ request: done.request });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
