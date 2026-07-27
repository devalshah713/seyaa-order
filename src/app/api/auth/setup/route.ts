// First-run only: creates the very first admin, then refuses forever after.
// This is how the owner sets their own password — it is never shipped in code,
// in an environment variable, or in a message to anyone.
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession } from "@/lib/session";
import { countUsers, createUser } from "@/lib/userStore";

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

  if ((await countUsers()) > 0) {
    return NextResponse.json(
      { error: "Setup has already been completed. Sign in instead." },
      { status: 409 }
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

  const created = await createUser(username, password, "admin");
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: 400 });

  const token = await signSession(
    { uid: created.user.id, username: created.user.username, role: "admin" },
    secret
  );
  const res = NextResponse.json({ ok: true, username: created.user.username });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
