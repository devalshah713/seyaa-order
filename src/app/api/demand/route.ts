import { NextRequest, NextResponse } from "next/server";
import { createDemand, listDemands, nextDemandNo, normalizeDemandInput } from "@/lib/demandStore";
import { startReceiptChasesQuietly } from "@/lib/receiptChaseRun";
import { currentSession } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const nextFor = req.nextUrl.searchParams.get("next");
    if (nextFor !== null) {
      return NextResponse.json({ demandNo: await nextDemandNo(nextFor) });
    }
    return NextResponse.json({ demands: await listDemands() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load demands." },
      { status: 503 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const input = normalizeDemandInput(body);
  if (!input.rows.length) {
    return NextResponse.json(
      { error: "Add at least one diamond row before saving." },
      { status: 400 }
    );
  }
  try {
    const demand = await createDemand(input);
    // The diamonds are now the diamond team's to bag and issue, so the clock
    // on them starts here. Quietly: the demand is saved either way.
    const session = await currentSession();
    await startReceiptChasesQuietly(demand, session?.username || "");
    return NextResponse.json({ demand });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the demand." },
      { status: 503 }
    );
  }
}
