import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

// Gate the whole app behind login. Any request without a valid session cookie
// is redirected to /login (API requests get a 401 instead of a redirect).
// The matcher below already excludes the login page, the login API, and static
// assets, so this runs on every "real" page and mutation.
export async function middleware(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);

  if (session) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except Next internals, the login page, and the login API.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth/login).*)"],
};
