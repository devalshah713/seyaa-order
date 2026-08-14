import { NextRequest } from "next/server";
import { get } from "@vercel/blob";

// Streams a design photo out of the private Blob store, so <img> tags (and the
// headless-Chromium PDF renderer) can display it.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return new Response("Storage not configured", { status: 501 });

  const path = req.nextUrl.searchParams.get("p") || "";
  // Only ever serve our own photo folder.
  if (!path.startsWith("pd-photos/")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const result = await get(path, { access: "private", token });
    if (!result || result.statusCode !== 200 || !result.stream) {
      return new Response("Not found", { status: 404 });
    }
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
