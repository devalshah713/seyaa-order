// Add a note to an order. Append-only, and stamped with whoever wrote it —
// the point of the log is knowing who said what, and when.
import { NextRequest, NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import { addOrderComment } from "@/lib/memoStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });

  try {
    const order = await addOrderComment(params.id, text, session.username);
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the note." },
      { status: 503 }
    );
  }
}
