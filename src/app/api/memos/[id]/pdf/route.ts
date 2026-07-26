import { NextRequest } from "next/server";
import { getMemo } from "@/lib/memoStore";
import { renderMemoPdf, originFromHeaders } from "@/lib/memoPdf";

// Server-side PDF download. Renders the saved memo with headless Chromium and
// returns a downloadable A4 PDF named by memo number.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const memo = await getMemo(params.id).catch(() => null);
  if (!memo) return new Response("Memo not found", { status: 404 });

  try {
    const pdf = await renderMemoPdf(originFromHeaders(req.headers), params.id);
    const filename = memo.memoNo.replace(/[/\\]/g, "_") + ".pdf";
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF generation failed.";
    return new Response(`Could not generate PDF: ${msg}`, { status: 500 });
  }
}
