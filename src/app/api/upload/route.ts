import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/currentUser";
import { logActivity } from "@/lib/sheetStore";

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

    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Uploaded photo",
        details: `${urls.length} photo(s)`,
      });
    }

    return NextResponse.json({ urls });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
