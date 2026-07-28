// Live check of typed stock numbers against the Google stock sheets, so the
// memo form can flag a problem while it is being filled rather than on save.
import { NextRequest, NextResponse } from "next/server";
import { checkMany } from "@/lib/stockSheet";
import { parseCodes } from "@/lib/memoFormat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  let codes: string[] = [];
  try {
    const body = (await req.json()) as { codes?: unknown };
    codes = parseCodes(Array.isArray(body.codes) ? body.codes.join(",") : String(body.codes ?? ""));
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!codes.length) return NextResponse.json({ checks: [] });

  try {
    return NextResponse.json({ checks: await checkMany(codes) });
  } catch (err) {
    // The sheets could not be read. Say so plainly — the form treats this as
    // "cannot verify" rather than pretending everything is fine.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the stock sheets." },
      { status: 503 }
    );
  }
}
