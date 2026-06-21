import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";
import { getCurrentUser } from "@/lib/currentUser";
import { logActivity } from "@/lib/sheetStore";

export async function POST(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (user) {
    logActivity({ user: user.username, role: user.role, action: "Signed out" });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
