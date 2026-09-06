import { NextResponse } from "next/server";
import { listReceiptChases } from "@/lib/receiptChaseStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ chases: await listReceiptChases() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the chase list." },
      { status: 503 }
    );
  }
}
