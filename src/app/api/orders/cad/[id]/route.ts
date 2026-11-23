// One CAD request: correcting its details, and removing it.
//
// Who may do either is decided by canEditCad() and canDeleteCad() in
// cadConfig.ts, asked here of the request as it is stored, and the page only
// hides what this would refuse. The raiser may correct his own while it is with
// the factory or sent back for changes, and remove his own before any CAD has
// come back; the owner may do both to any request until it becomes an order.
import { NextRequest, NextResponse } from "next/server";
import {
  changeCadRequest, deleteCadRequest, getCadRequest, listPartyNames,
} from "@/lib/memoStore";
import { GOLD_DETAILS } from "@/lib/memoFormat";
import { canDeleteCad, canEditCad, readCadDetails } from "@/lib/cadConfig";
import { currentSession } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  if (!(await currentSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    const request = await getCadRequest(id);
    if (!request) return NextResponse.json({ error: "CAD request not found." }, { status: 404 });
    return NextResponse.json({ request });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const me = { username: session.username, isAdmin: session.role === "admin" };
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  let mfgs: string[];
  let categories: string[];
  try {
    const lists = await listPartyNames(["mfg", "category"]);
    mfgs = (lists.mfg || []).map((e) => e.name);
    categories = (lists.category || []).map((e) => e.name);
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }

  const read = readCadDetails(body, { mfgs, categories, golds: GOLD_DETAILS });
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });

  try {
    const done = await changeCadRequest(
      id,
      () => read.details,
      { action: "edited", by: session.username },
      (r) => {
        if (canEditCad(r, me)) return "";
        if (r.status === "ordered") {
          return `${r.cadNo} already became order ${r.orderNo || r.orderId}, so it cannot be changed.`;
        }
        if (r.enteredBy !== me.username) {
          return "Only the owner can change somebody else's CAD request.";
        }
        return "A CAD has come back on this one, so it cannot be changed now. Ask the owner.";
      }
    );
    if (!done) return NextResponse.json({ error: "CAD request not found." }, { status: 404 });
    if ("refused" in done) return NextResponse.json({ error: done.refused }, { status: 403 });
    return NextResponse.json({ request: done.request });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const me = { username: session.username, isAdmin: session.role === "admin" };
  const { id } = await ctx.params;

  try {
    const existing = await getCadRequest(id);
    if (!existing) return NextResponse.json({ error: "CAD request not found." }, { status: 404 });
    if (!canDeleteCad(existing, me)) {
      const why =
        existing.status === "ordered"
          ? `${existing.cadNo} became order ${existing.orderNo || existing.orderId}, so it cannot be deleted.`
          : existing.enteredBy !== me.username
            ? "Only the owner can delete somebody else's CAD request."
            : "A CAD has come back on this one, so only the owner can delete it now.";
      return NextResponse.json({ error: why }, { status: existing.status === "ordered" ? 409 : 403 });
    }
    const gone = await deleteCadRequest(id);
    if (!gone) return NextResponse.json({ error: "CAD request not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
