// The controlled lists of names staff may choose but not invent: who a memo
// goes to, and who a design is made by. Anyone signed in may read them — the
// memo form and the PD sheet need them to offer choices — but only an admin
// may add to them.
import { NextRequest, NextResponse } from "next/server";
import { currentSession, requireAdmin } from "@/lib/currentUser";
import {
  clearParties, createParty, listParties, listPartyNames,
} from "@/lib/memoStore";
import { isPartyKind, type PartyKind } from "@/lib/memoFormat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await currentSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  try {
    // ?kinds=product,category,… answers with several lists in one go, which is
    // what a form with more than one dropdown wants.
    const many = params.get("kinds");
    if (many) {
      const kinds = many.split(",").map((k) => k.trim()).filter(isPartyKind);
      if (!kinds.length) {
        return NextResponse.json({ error: "No such list." }, { status: 400 });
      }
      return NextResponse.json({ lists: await listPartyNames(kinds) });
    }
    // ?kind=… is one list in full, with who added each name.
    const one = params.get("kind");
    const kind: PartyKind = isPartyKind(one) ? one : "party";
    return NextResponse.json({ parties: await listParties(kind) });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Only an admin can add a party." },
      { status: 403 }
    );
  }

  let name = "";
  let kind: PartyKind = "party";
  let parentId = "";
  let code = "";
  try {
    const body = (await req.json()) as {
      name?: unknown; kind?: unknown; parentId?: unknown; code?: unknown;
    };
    name = typeof body.name === "string" ? body.name : "";
    if (isPartyKind(body.kind)) kind = body.kind;
    if (typeof body.parentId === "string") parentId = body.parentId;
    if (typeof body.code === "string") code = body.code;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await createParty(name, admin.username, kind, parentId, code);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ party: result.party }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

// Emptying a whole list, so a set of built-in options can be cleared out before
// the real ones are entered. One at a time, and named — there is no "delete
// everything".
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!(await requireAdmin())) {
    return NextResponse.json(
      { error: "Only an admin can clear a list." },
      { status: 403 }
    );
  }
  const kind = req.nextUrl.searchParams.get("kind");
  if (!isPartyKind(kind)) {
    return NextResponse.json({ error: "No such list." }, { status: 400 });
  }
  try {
    return NextResponse.json({ removed: await clearParties(kind) });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}
