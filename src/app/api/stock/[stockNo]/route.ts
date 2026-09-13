import { NextResponse } from "next/server";
import { stockHistory } from "@/lib/memoStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Full movement history for one stock number — every memo it went out on and
// what became of it each time.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ stockNo: string }> }
): Promise<NextResponse> {
  const params = await ctx.params;
  try {
    return NextResponse.json({ history: await stockHistory(params.stockNo) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unavailable." },
      { status: 503 }
    );
  }
}
