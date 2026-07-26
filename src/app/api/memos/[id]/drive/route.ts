import { NextRequest, NextResponse } from "next/server";
import { getMemo, setDriveLink } from "@/lib/memoStore";
import { renderMemoPdf, originFromHeaders } from "@/lib/memoPdf";
import { isDriveConfigured, uploadMemoPdf } from "@/lib/googleDrive";

// Render the memo PDF and upload (or overwrite) it in Google Drive, then store
// the resulting link on the memo. Used by the auto-save on the memo view and
// the manual "Save to Drive" button.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!isDriveConfigured()) {
    return NextResponse.json(
      { error: "Google Drive is not connected. Add the Google credentials in Vercel." },
      { status: 501 }
    );
  }

  const memo = await getMemo(params.id).catch(() => null);
  if (!memo) return NextResponse.json({ error: "Memo not found." }, { status: 404 });

  try {
    const pdf = await renderMemoPdf(originFromHeaders(req.headers), params.id);
    const filename = memo.memoNo.replace(/[/\\]/g, "_") + ".pdf";
    const { link } = await uploadMemoPdf(filename, pdf);
    await setDriveLink(params.id, link);
    return NextResponse.json({ link });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Drive upload failed.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
