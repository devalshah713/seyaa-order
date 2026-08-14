// Admin-only: list the accounts, and create new ones.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { createUser, listUsers } from "@/lib/userStore";
import type { Role } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }

  let username = "";
  let password = "";
  let role: Role = "user";
  let modules: unknown = [];
  try {
    const body = (await req.json()) as {
      username?: string; password?: string; role?: string; modules?: unknown;
    };
    username = (body.username || "").trim();
    password = body.password || "";
    role = body.role === "admin" ? "admin" : "user";
    modules = body.modules;
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const created = await createUser(username, password, role, modules);
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 });
  return NextResponse.json({ ok: true, user: created.user }, { status: 201 });
}
