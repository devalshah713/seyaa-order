import { NextRequest, NextResponse } from "next/server";
import { syncDesignRegisterQuietly } from "@/lib/designRegister";
import { createPdSheet, listPdSheets, nextPdNo, normalizePdInput } from "@/lib/pdStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // ?next=<date> returns the predicted PD number for the live form.
    const nextFor = req.nextUrl.searchParams.get("next");
    if (nextFor !== null) {
      return NextResponse.json({ pdNo: await nextPdNo(nextFor) });
    }
    return NextResponse.json({ sheets: await listPdSheets() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load PD sheets." },
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

  const input = normalizePdInput(body);
  if (!input.sku && !input.product) {
    return NextResponse.json(
      { error: "Add at least a Product or SKU before saving." },
      { status: 400 }
    );
  }

  try {
    const sheet = await createPdSheet(input);
    // The Google Sheet is a copy of the register, so it is rewritten whenever
    // the register changes. Quietly: a design must save whether Google answers
    // or not.
    await syncDesignRegisterQuietly();
    return NextResponse.json({ sheet });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the PD sheet." },
      { status: 503 }
    );
  }
}
