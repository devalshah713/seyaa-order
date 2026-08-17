import { NextRequest, NextResponse } from "next/server";
import { deleteJangadRow, normalizeJangadRow, updateJangadRow } from "@/lib/jangadStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const row = await updateJangadRow(params.id, normalizeJangadRow(body));
    if (!row) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    return NextResponse.json({ row });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the entry." },
      { status: 503 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const ok = await deleteJangadRow(params.id);
    if (!ok) return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete." },
      { status: 503 }
    );
  }
}
