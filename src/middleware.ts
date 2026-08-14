// Front door for the whole app: nothing renders and no API answers without a
// valid session cookie.
//
// Two deliberate exceptions:
//   * /login and its APIs — otherwise there is no way to sign in.
//   * a correct x-backup-token — the nightly Windows backup is a machine with
//     no browser and no session, so it authenticates with the backup secret
//     instead. That covers /api/backup and the per-memo PDF downloads.
import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  needsRenewal,
  signSession,
  verifySession,
} from "@/lib/session";
import { canAccessPath, landingPath } from "@/lib/access";

const PUBLIC_PATHS = ["/login"];
const PUBLIC_APIS = ["/api/auth/login", "/api/auth/setup", "/api/auth/status"];

function isPublic(pathname: string): boolean {
  return (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    PUBLIC_APIS.some((p) => pathname === p)
  );
}

// The backup machine may fetch the database export and any memo's PDF.
function backupTokenOk(req: NextRequest): boolean {
  const expected = process.env.BACKUP_TOKEN;
  if (!expected) return false;
  const provided =
    req.headers.get("x-backup-token") || req.nextUrl.searchParams.get("token") || "";
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function backupReachablePath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/backup") ||
    /^\/api\/memos\/[^/]+\/pdf$/.test(pathname) ||
    /^\/api\/pd\/[^/]+\/pdf$/.test(pathname) ||
    // The nightly job saves a dated copy of the order board image.
    pathname === "/api/orders/image"
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  if (backupReachablePath(pathname) && backupTokenOk(req)) return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  if (secret) {
    const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret);
    if (session) {
      // Signed in, but this feature may not be theirs. Admins bypass this.
      if (!canAccessPath(session, pathname)) {
        if (pathname.startsWith("/api/")) {
          return NextResponse.json(
            { error: "You do not have access to this feature." },
            { status: 403 }
          );
        }
        const to = req.nextUrl.clone();
        to.pathname = landingPath(session);
        to.search = "";
        return NextResponse.redirect(to);
      }

      const res = NextResponse.next();
      // Slide the expiry forward for anyone still working, so a long day at
      // the desk never ends in a failed save.
      if (needsRenewal(session)) {
        const fresh = await signSession(
          {
            uid: session.uid,
            username: session.username,
            role: session.role,
            mods: session.mods,
          },
          secret
        );
        res.cookies.set(SESSION_COOKIE, fresh, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: SESSION_MAX_AGE,
        });
      }
      return res;
    }
  }

  // APIs get a flat 401 — a redirect would only confuse a fetch() caller.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const to = req.nextUrl.clone();
  to.pathname = "/login";
  to.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(to);
}

export const config = {
  // Everything except Next's own assets and the files in /public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
