// Approving an order, sending it back, and sending it in again.
//
// Two decisions, in order: the seller's manager if they have one, and then an
// admin, which is the last word. Approving at the manager's stage is not the
// final approval even when an admin is the one who did it — they are two
// decisions about two different things, and the second one is the owner's.
//
// Who may do what is decided here and nowhere else. The screens hide the
// buttons from people who cannot use them, which is a courtesy; this is the
// rule.
import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import { getOrder, setOrderApproval } from "@/lib/memoStore";
import { stageOf } from "@/lib/memoFormat";
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
    // A send back at either stage starts the chain from the beginning, so a
    // corrected order goes to its manager again and only then to the owner.
    // Without a manager it starts at the owner's stage, because every order
    // now needs that approval.
    return run(setOrderApproval(
      params.id,
      waitingOn.id
        ? {
            approval: "waiting",
            stage: "manager",
            approverId: waitingOn.id,
            approverName: waitingOn.username,
          }
        : { approval: "waiting", stage: "owner", approverId: "", approverName: "" },
      {
        text: waitingOn.id
          ? `Corrected and sent in again. Waiting for approval from ${waitingOn.username}.`
          : "Corrected and sent in again. Waiting for the owner's approval.",
        by: session.username,
      }
    ));
  }

  // Nobody signs off their own order, at either stage. An admin's own order is
  // no different: it waits for a second admin.
  if (isTheSeller) {
    return NextResponse.json(
      { error: "You cannot approve your own order. Somebody else has to." },
      { status: 403 }
    );
  }

  // Which of the two decisions is outstanding settles who may make it. The
  // owner's stage is any admin, not a named person, so there is nothing to
  // compare a manager's id against.
  const stage = stageOf(order);
  if (stage === "owner") {
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only an admin can give the final approval." },
        { status: 403 }
      );
    }
  } else if (!isAdmin && !isTheManager) {
    return NextResponse.json(
      { error: "Only this order's manager, or an admin, can approve it." },
      { status: 403 }
    );
  }

  if (action === "approve") {
    if (order.approval !== "waiting" && order.approval !== "sent_back") {
      return NextResponse.json({ error: "This order is already approved." }, { status: 400 });
    }
    // The manager's stage hands the order on; it does not let it go ahead.
    // The name it was waiting on is cleared with it, so a leftover name cannot
    // read as the person still being waited for.
    if (stage === "manager") {
      return run(setOrderApproval(
        params.id,
        { approval: "waiting", stage: "owner", approverId: "", approverName: "" },
        { text: "Approved. Now waiting for the owner's approval.", by: session.username }
      ));
    }
    return run(setOrderApproval(
      params.id,
      { approval: "approved", stage: "owner" },
      { text: "Approved. The order can go ahead.", by: session.username }
    ));
  }

  if (action === "send_back") {
    if (!reason) {
      return NextResponse.json(
        { error: "Write one line saying why it is going back." },
        { status: 400 }
      );
    }
    // The stage is left as it was, so the order says which decision sent it
    // back. The seller sending it in again is what restarts the chain.
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
