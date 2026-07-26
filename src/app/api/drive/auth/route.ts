import { NextRequest, NextResponse } from "next/server";
import { authUrl } from "@/lib/googleDrive";
import { originFromHeaders } from "@/lib/memoPdf";

// One-time setup: redirects the owner to Google's consent screen. After
// approving, Google returns to /api/drive/callback with a refresh token.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel first." },
      { status: 501 }
    );
  }
  const redirectUri = `${originFromHeaders(req.headers)}/api/drive/callback`;
  return NextResponse.redirect(authUrl(redirectUri));
}
