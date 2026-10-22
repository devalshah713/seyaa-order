// Admin-only: change an account's role / feature access, or remove it.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { deleteUser, setUserManager, updateUserAccess } from "@/lib/userStore";
import type { Role } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const params = await ctx.params;
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  let role: Role = "user";
  let modules: unknown = [];
  // Sent as "" to clear the manager, left out entirely to leave it alone.
  let managerId: string | undefined;
  try {
    const body = (await req.json()) as {
      role?: string; modules?: unknown; managerId?: unknown;
    };
    role = body.role === "admin" ? "admin" : "user";
    modules = body.modules;
    if (typeof body.managerId === "string") managerId = body.managerId.trim();
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

  // The manager is set after the access, and its own refusal is reported on
  // its own, so a bad manager choice does not silently discard the access
  // change that already went through.
  if (managerId !== undefined) {
    const chain = await setUserManager(params.id, managerId);
    if (!chain.ok) return NextResponse.json({ error: chain.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<Response> {
  const params = await ctx.params;
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
