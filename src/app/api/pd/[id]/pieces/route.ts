import { NextRequest, NextResponse } from "next/server";
import { setPdPieces, normalizePieceInput } from "@/lib/pdStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Progress on the individual pieces of a design, saved on its own so the
// production floor can update a piece without reopening the whole PD sheet.
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const sheet = await setPdPieces(params.id, normalizePieceInput(body.pieces));
    if (!sheet) return NextResponse.json({ error: "PD sheet not found." }, { status: 404 });
    return NextResponse.json({ sheet });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the pieces." },
      { status: 503 }
    );
  }
}
