// Reads the signed session on the server (route handlers and server
// components). Middleware has already rejected unauthenticated requests before
// these run — this is for knowing *who* is signed in, and whether they're an
// admin, rather than whether anyone is.
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type Session } from "./session";

// The cookie is read first, and unconditionally, even when there is no secret
// to check it against and the answer is therefore already known.
//
// That looks wasteful and is not. Reading a cookie is what tells Next.js a page
// is rendered per request; skipping it when AUTH_SECRET is unset makes a page's
// dynamic-ness depend on whether a setting happens to exist. Build and runtime
// can disagree about that — on Cloudflare the build never sees the Worker's
// secrets — and then a page prerendered as a static file throws the moment the
// layout asks for a cookie. It cost an afternoon: the sign-in page returned 500
// on Cloudflare and worked on Vercel, from the same commit.
export async function currentSession(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return verifySession(token, secret);
}

export async function requireAdmin(): Promise<Session | null> {
  const s = await currentSession();
  return s && s.role === "admin" ? s : null;
}
