import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/usersStore";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/session";
import { logActivity } from "@/lib/sheetStore";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = (body.username || "").trim();
  const password = body.password || "";
  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const user = await authenticate(username, password);
  if (!user) {
    return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
  }

  const token = await createSessionToken(user);
  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  // Record the sign-in (non-blocking).
  logActivity({ user: user.username, role: user.role, action: "Signed in" });

  return res;
}
