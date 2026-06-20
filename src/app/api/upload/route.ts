import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

// Photos are uploaded directly from the browser to Vercel Blob (client
// upload). The file never passes through this function, so it is not subject
// to Vercel's 4.5 MB serverless request-body limit — important because phone
// photos are routinely larger than that. This route only authorises the
// upload and hands back a short-lived client token, signed with the static
// BLOB_READ_WRITE_TOKEN.
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

  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      token,
      onBeforeGenerateToken: async () => ({
        // Allow any image format (jpg, png, heic, webp, …).
        allowedContentTypes: ["image/*"],
        addRandomSuffix: true,
        maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB per photo
      }),
      // Required by the type; nothing to do on completion for our flow.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload] failed:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
