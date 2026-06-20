import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Serves a private Vercel Blob image to the browser. Photos are stored in a
// private Blob store, so their URLs can't be loaded by a plain <img> tag —
// they require the read-write token in an Authorization header. This route
// fetches the blob server-side with that token and streams it back, so the
// order page can display photos with <img src="/api/photo?u=...">.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const u = req.nextUrl.searchParams.get("u");
  if (!u) return new NextResponse("Missing url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(u);
  } catch {
    return new NextResponse("Bad url", { status: 400 });
  }
  // Only proxy Vercel Blob URLs (prevents this route being used as an open proxy).
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new NextResponse("Storage not configured", { status: 503 });

  const upstream = await fetch(u, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!upstream.ok) return new NextResponse("Not found", { status: upstream.status });

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  const buffer = await upstream.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=3600",
    },
  });
}
