import { NextRequest, NextResponse } from "next/server";
import { deleteQcRecord, normalizeQcInput, updateQcRecord } from "@/lib/qcStore";

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
    const record = await updateQcRecord(params.id, normalizeQcInput(body));
    if (!record) return NextResponse.json({ error: "QC record not found." }, { status: 404 });
    return NextResponse.json({ record });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the QC." },
      { status: 503 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const ok = await deleteQcRecord(params.id);
    if (!ok) return NextResponse.json({ error: "QC record not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete." },
      { status: 503 }
    );
  }
}
