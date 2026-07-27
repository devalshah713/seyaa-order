import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";
import { findByUsername, verifyPassword } from "@/lib/userStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<Response> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Sign-in is not configured. Set AUTH_SECRET in Vercel." },
      { status: 501 }
    );
  }

  let username = "";
  let password = "";
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    username = (body.username || "").trim();
    password = body.password || "";
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const user = await findByUsername(username);
  // Same message either way: a wrong username and a wrong password must not be
  // distinguishable, or the form becomes a way to discover who has an account.
  const ok = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !ok) {
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  const token = await signSession({ uid: user.id, username: user.username, role: user.role }, secret);
  const res = NextResponse.json({ ok: true, username: user.username, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
