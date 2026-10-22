// Approving an order, sending it back, and sending it in again.
//
// Who may do what is decided here and nowhere else. The screens hide the
// buttons from people who cannot use them, which is a courtesy; this is the
// rule.
import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import { getOrder, setOrderApproval } from "@/lib/memoStore";
import { managerOf } from "@/lib/userStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const params = await ctx.params;
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let action = "";
  let reason = "";
  try {
    const body = (await req.json()) as { action?: unknown; reason?: unknown };
    action = typeof body.action === "string" ? body.action : "";
    reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let order;
  try {
    order = await getOrder(params.id);
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const isAdmin = session.role === "admin";
  const isTheManager = !!order.approverId && order.approverId === session.uid;
  const isTheSeller = !!order.enteredBy && order.enteredBy === session.username;

  // Sending it in again is the seller's move, not the manager's.
  if (action === "resubmit") {
    if (!isTheSeller && !isAdmin) {
      return NextResponse.json(
        { error: "Only the person who entered this order can send it in again." },
        { status: 403 }
      );
    }
    if (order.approval !== "sent_back") {
      return NextResponse.json(
        { error: "This order was not sent back, so there is nothing to send in again." },
        { status: 400 }
      );
    }
    // The manager is read off the seller's account again rather than reused,
    // so an order sent in again after the chain changed waits on whoever
    // approves that seller now.
    let manager: { id: string; username: string } | null = null;
    try {
      manager = isTheSeller ? await managerOf(session.uid) : null;
    } catch (err) {
      return NextResponse.json({ error: msg(err) }, { status: 503 });
    }
    const waitingOn = manager || { id: order.approverId || "", username: order.approverName || "" };
    return run(setOrderApproval(
      params.id,
      waitingOn.id
        ? {
            approval: "waiting",
            approverId: waitingOn.id,
            approverName: waitingOn.username,
          }
        : { approval: "approved" },
      {
        text: waitingOn.id
          ? `Corrected and sent in again. Waiting for approval from ${waitingOn.username}.`
          : "Corrected and sent in again. No manager to approve it, so it goes ahead.",
        by: session.username,
      }
    ));
  }

  // Everything else is the manager's move. An admin can always stand in; the
  // seller never can, even if somebody has set them as their own manager by
  // mistake.
  if (isTheSeller && !isAdmin) {
    return NextResponse.json(
      { error: "You cannot approve your own order." },
      { status: 403 }
    );
  }
  if (!isAdmin && !isTheManager) {
    return NextResponse.json(
      { error: "Only this order's manager, or an admin, can approve it." },
      { status: 403 }
    );
  }

  if (action === "approve") {
    if (order.approval !== "waiting" && order.approval !== "sent_back") {
      return NextResponse.json({ error: "This order is already approved." }, { status: 400 });
    }
    return run(setOrderApproval(
      params.id,
      { approval: "approved" },
      { text: "Approved.", by: session.username }
    ));
  }

  if (action === "send_back") {
    if (!reason) {
      return NextResponse.json(
        { error: "Write one line saying why it is going back." },
        { status: 400 }
      );
    }
    return run(setOrderApproval(
      params.id,
      { approval: "sent_back", sentBackReason: reason },
      { text: `Sent back: ${reason}`, by: session.username }
    ));
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

// A store that cannot be reached is reported as that, not as a missing order.
async function run(saving: Promise<unknown>): Promise<NextResponse> {
  let order: unknown;
  try {
    order = await saving;
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  return NextResponse.json({ order });
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
