// Admin-only: remove an account.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { deleteUser } from "@/lib/userStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  // Deleting yourself would sign you out mid-session with no obvious cause.
  if (params.id === admin.uid) {
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const result = await deleteUser(params.id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
