import { NextRequest, NextResponse } from "next/server";
import { peekNextMemoNo } from "@/lib/memoStore";

export const dynamic = "force-dynamic";

// Predicted next memo number for the live form preview. Indicative only —
// the authoritative number is assigned on save.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const date = req.nextUrl.searchParams.get("date") || "";
  const kind = req.nextUrl.searchParams.get("kind") === "gold" ? "gold" : "jewellery";
  try {
    return NextResponse.json({ memoNo: await peekNextMemoNo(date, kind) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unavailable." },
      { status: 503 }
    );
  }
}
