import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { deleteParty, renameParty } from "@/lib/memoStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Only an admin can change a party." }, { status: 403 });
  }
  let name = "";
  let code: string | undefined;
  try {
    const body = (await req.json()) as { name?: unknown; code?: unknown };
    name = typeof body.name === "string" ? body.name : "";
    if (typeof body.code === "string") code = body.code;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const result = await renameParty(params.id, name, code);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Only an admin can remove a party." }, { status: 403 });
  }
  const result = await deleteParty(params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
