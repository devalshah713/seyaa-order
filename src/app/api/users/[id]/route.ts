// Admin-only: change an account's role / feature access, or remove it.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { deleteUser, updateUserAccess } from "@/lib/userStore";
import type { Role } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  let role: Role = "user";
  let modules: unknown = [];
  try {
    const body = (await req.json()) as { role?: string; modules?: unknown };
    role = body.role === "admin" ? "admin" : "user";
    modules = body.modules;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Removing your own admin rights mid-session would lock you out of this very
  // screen with no way back.
  if (params.id === admin.uid && role !== "admin") {
    return NextResponse.json(
      { error: "You cannot remove your own admin access." },
      { status: 400 }
    );
  }

  const result = await updateUserAccess(params.id, role, modules);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}

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
