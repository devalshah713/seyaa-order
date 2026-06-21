// Server-side helper to read the logged-in user from the session cookie.
// Use this in server components and route handlers. Returns null if there is
// no valid session.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type SessionData } from "./session";

export async function getCurrentUser(): Promise<SessionData | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
}
