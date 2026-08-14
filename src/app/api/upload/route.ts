import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";

// Uploads a design photo to the private Blob store and returns its pathname.
// The image is compressed in the browser first, so requests stay well under
// Vercel's body limit. Photos are read back through /api/photo (private blobs
// cannot be fetched directly by the browser).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Storage is not configured. Add BLOB_READ_WRITE_TOKEN in Vercel." },
      { status: 501 }
    );
  }

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file || !file.size) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Please choose an image file." }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const name = `pd-photos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const blob = await put(name, file, {
      access: "private",
      token,
      addRandomSuffix: true,
      contentType: file.type,
    });

    return NextResponse.json({ path: blob.pathname });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 500 }
    );
  }
}
