// Reads the signed session on the server (route handlers and server
// components). Middleware has already rejected unauthenticated requests before
// these run — this is for knowing *who* is signed in, and whether they're an
// admin, rather than whether anyone is.
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type Session } from "./session";

export async function currentSession(): Promise<Session | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return verifySession(cookies().get(SESSION_COOKIE)?.value, secret);
}

export async function requireAdmin(): Promise<Session | null> {
  const s = await currentSession();
  return s && s.role === "admin" ? s : null;
}
