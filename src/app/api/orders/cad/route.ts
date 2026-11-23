// The CAD request book's own API, under the order module.
//
// At /api/orders/cad on purpose, as quotations are: every path under
// /api/orders belongs to the `orders` module in access.ts, so exactly the people
// who can write orders can raise a CAD request, and it needs no permission of
// its own.
//
// What is asked for is what goes to the factory today on WhatsApp: which
// factory, the reference photos, the centre stone, and the piece. The factory,
// at least one photo, the stone's shape and its carats are compulsory, and so
// are the category and the gold, because the order it becomes cannot be saved
// without them. Everything else is optional.
import { NextRequest, NextResponse } from "next/server";
import { createCadRequest, listCadRows, listPartyNames } from "@/lib/memoStore";
import { GOLD_DETAILS } from "@/lib/memoFormat";
import { readCadDetails } from "@/lib/cadConfig";
import { currentSession } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  if (!(await currentSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    // The list's own columns, never the requests whole.
    return NextResponse.json({ requests: await listCadRows() });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Who raised it is part of the record and is read off the signed session.
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // The two lists the request is checked against. A list that cannot be read
  // is a failure to say so, never an empty list that refuses every factory.
  let mfgs: string[];
  let categories: string[];
  try {
    const lists = await listPartyNames(["mfg", "category"]);
    mfgs = (lists.mfg || []).map((e) => e.name);
    categories = (lists.category || []).map((e) => e.name);
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }

  // Every box checked here as well as on the form. The form can be bypassed.
  const read = readCadDetails(body, { mfgs, categories, golds: GOLD_DETAILS });
  if (!read.ok) return NextResponse.json({ error: read.error }, { status: 400 });

  try {
    const request = await createCadRequest({
      ...read.details,
      enteredBy: session.username,
    });
    return NextResponse.json({ request }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
