// PNG of the order board, for sharing on WhatsApp.
//
// Reachable with a session (the buttons in the app) or with the backup token,
// so the nightly Windows job can save dated copies without a browser.
//
// A long list becomes unreadable once WhatsApp scales it to a phone's width,
// so the board is split into parts. ?part=N selects one; the response carries
// X-Total-Parts so a caller that does not know the order count -- the backup
// script -- can fetch the first and then loop over the rest.
import { NextRequest } from "next/server";
import { originFromHeaders, renderOrderBoardPng } from "@/lib/memoPdf";
import { listOrders } from "@/lib/memoStore";
import { OPEN_STATUSES, imagePartCount, todayInput } from "@/lib/memoFormat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const orders = await listOrders();
    const open = orders.filter((o) => OPEN_STATUSES.includes(o.status)).length;
    const parts = imagePartCount(open);

    const asked = parseInt(req.nextUrl.searchParams.get("part") || "1", 10) || 1;
    const part = Math.min(Math.max(asked, 1), parts);

    const png = await renderOrderBoardPng(originFromHeaders(req.headers), part);
    const suffix = parts > 1 ? ` (${part} of ${parts})` : "";

    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-disposition": `attachment; filename="Seyaa Orders ${todayInput()}${suffix}.png"`,
        "x-total-parts": String(parts),
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
