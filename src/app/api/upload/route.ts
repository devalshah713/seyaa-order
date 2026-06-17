import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // The Blob store is connected via OIDC (no static BLOB_READ_WRITE_TOKEN),
  // so the @vercel/blob SDK authenticates automatically on Vercel. If a
  // classic read-write token is present we pass it explicitly; otherwise the
  // SDK falls back to OIDC. Either way we just try the upload and surface any
  // real error rather than pre-checking for a token that may not exist.
  const token = process.env.BLOB_READ_WRITE_TOKEN;

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
        access: "public",
        ...(token ? { token } : {}),
      });
      urls.push(blob.url);
    }

    return NextResponse.json({ urls });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
