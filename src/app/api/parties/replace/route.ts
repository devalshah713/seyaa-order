import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { replacePartyOnMemos } from "@/lib/memoStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Putting old memos onto a name from the list. Admin only, one name at a time,
// and it says how many memos it touched — this rewrites saved paperwork.
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!(await requireAdmin())) {
    return NextResponse.json(
      { error: "Only an admin can change the name on a memo." },
      { status: 403 }
    );
  }

  let from = "";
  let to = "";
  try {
    const body = (await req.json()) as { from?: unknown; to?: unknown };
    from = typeof body.from === "string" ? body.from : "";
    to = typeof body.to === "string" ? body.to : "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!from.trim() || !to.trim()) {
    return NextResponse.json({ error: "Name both sides." }, { status: 400 });
  }

  try {
    const result = await replacePartyOnMemos(from, to);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ memos: result.memos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Something went wrong." },
      { status: 503 }
    );
  }
}
