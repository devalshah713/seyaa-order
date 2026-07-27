import { NextResponse } from "next/server";
import { listOpenIssues } from "@/lib/memoStore";

export const dynamic = "force-dynamic";

// Gold Issue memos, so a Receipt can be booked against the batch it settles.
export async function GET(): Promise<NextResponse> {
  try {
    return NextResponse.json({ issues: await listOpenIssues() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unavailable." },
      { status: 503 }
    );
  }
}
