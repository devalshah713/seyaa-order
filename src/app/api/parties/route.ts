// The controlled list of parties. Anyone signed in may read it — the memo form
// needs it to offer choices — but only an admin may add to it.
import { NextRequest, NextResponse } from "next/server";
import { currentSession, requireAdmin } from "@/lib/currentUser";
import { createParty, listParties } from "@/lib/memoStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  if (!(await currentSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    return NextResponse.json({ parties: await listParties() });
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
  try {
    const body = (await req.json()) as { name?: unknown };
    name = typeof body.name === "string" ? body.name : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await createParty(name, admin.username);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ party: result.party }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
