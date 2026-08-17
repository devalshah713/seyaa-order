import { NextRequest, NextResponse } from "next/server";
import { originFromHeaders, renderPagePdf } from "@/lib/memoPdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// The issue slip for the picked entries, as a PDF to print and staple to the
// manufacturer's memo.
export async function GET(req: NextRequest): Promise<Response> {
  const ids = (req.nextUrl.searchParams.get("ids") || "").trim();
  if (!ids) {
    return NextResponse.json({ error: "Nothing selected to print." }, { status: 400 });
  }

  try {
    const origin = originFromHeaders(req.headers);
    const pdf = await renderPagePdf(
      origin,
      `/jangad/print?pdf=1&ids=${encodeURIComponent(ids)}`
    );
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="Diamond Issue ${stamp}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not build the PDF." },
      { status: 503 }
    );
  }
}
