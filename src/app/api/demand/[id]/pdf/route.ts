import { NextRequest } from "next/server";
import { getDemand } from "@/lib/demandStore";
import { renderDemandPdf, originFromHeaders } from "@/lib/memoPdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const demand = await getDemand(params.id).catch(() => null);
  if (!demand) return new Response("Demand not found", { status: 404 });

  try {
    const pdf = await renderDemandPdf(originFromHeaders(req.headers), params.id);
    const base = demand.demandNo.replace(/[/\\:*?"<>|]/g, "_");
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
