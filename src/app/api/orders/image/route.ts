// PNG of the order board, for sharing on WhatsApp.
//
// Reachable with a session (the button in the app) or with the backup token,
// so the nightly Windows job can save a dated copy without a browser.
import { NextRequest } from "next/server";
import { originFromHeaders, renderOrderBoardPng } from "@/lib/memoPdf";
import { todayInput } from "@/lib/memoFormat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const png = await renderOrderBoardPng(originFromHeaders(req.headers));
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-disposition": `attachment; filename="Seyaa Orders ${todayInput()}.png"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return new Response(
      `Could not build the order image: ${err instanceof Error ? err.message : "unknown error"}`,
      { status: 500 }
    );
  }
}
