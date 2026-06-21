import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { listUsers, createUser, deleteUser, setPassword } from "@/lib/usersStore";
import { logActivity } from "@/lib/sheetStore";

// All team management is admin-only.
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    return NextResponse.json({ users: await listUsers() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    const user = await createUser({
      username: body.username || "",
      name: body.name || "",
      role: body.role === "admin" ? "admin" : "staff",
      password: body.password || "",
    });
    logActivity({
      user: admin.username,
      role: admin.role,
      action: "Added employee",
      details: `${user.name} (${user.username}) as ${user.role}`,
    });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  try {
    await setPassword(body.username || "", body.password || "");
    logActivity({
      user: admin.username,
      role: admin.role,
      action: "Reset password",
      details: `for ${body.username}`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const username = req.nextUrl.searchParams.get("username") || "";
  if (username.toLowerCase() === admin.username.toLowerCase()) {
    return NextResponse.json({ error: "You cannot remove your own account." }, { status: 400 });
  }
  try {
    await deleteUser(username);
    logActivity({
      user: admin.username,
      role: admin.role,
      action: "Removed employee",
      details: username,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
