import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

// Photos are stored in Vercel Blob using a static read-write token supplied
// via the BLOB_READ_WRITE_TOKEN environment variable. We pass the token to
// put() explicitly so this works regardless of how the store is connected.
export async function POST(req: NextRequest) {
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
      const blob = await put(filename, file, { access: "public", token });
      urls.push(blob.url);
    }

    return NextResponse.json({ urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
