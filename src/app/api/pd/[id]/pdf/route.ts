import { NextRequest } from "next/server";
import { getPdSheet } from "@/lib/pdStore";
import { renderPdSheetPdf, originFromHeaders } from "@/lib/memoPdf";

// Downloads the PD sheet as an A4 PDF named by its SKU (falling back to the
// PD number), so files are recognisable in the designer's folder.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const sheet = await getPdSheet(params.id).catch(() => null);
  if (!sheet) return new Response("PD sheet not found", { status: 404 });

  try {
    const pdf = await renderPdSheetPdf(originFromHeaders(req.headers), params.id);
    const base = (sheet.sku || sheet.pdNo).replace(/[/\\:*?"<>|]/g, "_");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF generation failed.";
    return new Response(`Could not generate PDF: ${msg}`, { status: 500 });
  }
}
