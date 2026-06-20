import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

// Photos are uploaded through this route to Vercel Blob using the static
// BLOB_READ_WRITE_TOKEN. Images are compressed in the browser first, so they
// stay well under Vercel's 4.5 MB request limit. Doing the put() server-side
// (rather than a client direct-upload) means every upload is observable in
// the runtime logs, which makes failures diagnosable.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Photo storage is not configured. Add the BLOB_READ_WRITE_TOKEN environment variable in Vercel and redeploy.",
      },
      { status: 503 }
    );
  }

  try {
    const formData = await req.formData();
    const files = formData.getAll("files") as File[];
    if (!files.length || !files[0]?.size) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const urls: string[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const filename = `orders/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const blob = await put(filename, file, {
        access: "private",
        token,
        addRandomSuffix: true,
      });
      urls.push(blob.url);
    }

    return NextResponse.json({ urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Self-test: GET /api/upload?selftest=1 writes a tiny blob and returns its
// URL, proving the token + storage work without needing a browser upload.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.nextUrl.searchParams.get("selftest") !== "1") {
    return NextResponse.json({ ok: true, route: "upload" });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "BLOB_READ_WRITE_TOKEN missing" },
      { status: 503 }
    );
  }
  try {
    const blob = await put(
      `selftest/${Date.now()}.txt`,
      `ok ${new Date().toISOString()}`,
      { access: "private", token, addRandomSuffix: true, contentType: "text/plain" }
    );
    return NextResponse.json({ ok: true, url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
