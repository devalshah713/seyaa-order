import { NextRequest, NextResponse } from "next/server";
import { updatePdSheet, deletePdSheet, normalizePdInput } from "@/lib/pdStore";
import { syncDesignRegisterQuietly } from "@/lib/designRegister";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
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
    const sheet = await updatePdSheet(params.id, input);
    if (!sheet) return NextResponse.json({ error: "PD sheet not found." }, { status: 404 });
    await syncDesignRegisterQuietly();
    return NextResponse.json({ sheet });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the PD sheet." },
      { status: 503 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const ok = await deletePdSheet(params.id);
    if (!ok) return NextResponse.json({ error: "PD sheet not found." }, { status: 404 });
    await syncDesignRegisterQuietly();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not delete." },
      { status: 503 }
    );
  }
}
