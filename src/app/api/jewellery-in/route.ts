import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import { reconcileIssue } from "@/lib/diamondIssueStore";
import { appendReturns, ReturnInput } from "@/lib/diamondReturnStore";
import { ISSUE_STATUSES } from "@/lib/diamondIssueConfig";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

type IncomingMemo = {
  memoNo: string;
  used: { ctsUsed?: string; pcsUsed?: string }[];
};
type IncomingReturn = {
  description?: string;
  shape?: string;
  size?: string;
  caratWeight?: string;
  pcs?: string;
  comments?: string;
  remark?: string;
};
type IncomingBody = {
  designNumber?: string;
  receivedDate?: string;
  status?: string;
  comments?: string;
  memos?: IncomingMemo[];
  returns?: IncomingReturn[];
};

// Record a jewellery-in (receiving) event for a design: for each issued memo,
// write back the diamonds actually used (which also computes the difference =
// returned) and set the memo status + received date. Any returned/broken
// diamonds are appended to the clean "Diamond Return" log.
export async function POST(req: NextRequest) {
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Storage is not connected yet. The Google Sheet still needs to be linked." },
      { status: 503 }
    );
  }

  let body: IncomingBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const designNumber = String(body.designNumber || "").trim();
  const status = String(body.status || "");
  const receivedDate = String(body.receivedDate || "");
  const comments = body.comments != null ? String(body.comments) : undefined;
  const memos = Array.isArray(body.memos) ? body.memos : [];

  if (!designNumber)
    return NextResponse.json({ error: "Design Number is required" }, { status: 400 });
  if (!ISSUE_STATUSES.includes(status as (typeof ISSUE_STATUSES)[number]))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  if (!memos.length)
    return NextResponse.json({ error: "No issued memos to receive against." }, { status: 400 });

  try {
    // Write back each memo's used diamonds + status. reconcileIssue recomputes
    // the per-bag difference and rewrites the whole memo so the sheet stays
    // exactly correct.
    for (const m of memos) {
      const memoNo = String(m.memoNo || "").trim();
      if (!memoNo) continue;
      await reconcileIssue({
        memoNo,
        status,
        receivedDate,
        comments,
        used: (m.used || []).map((u) => ({
          ctsUsed: String(u?.ctsUsed ?? ""),
          pcsUsed: String(u?.pcsUsed ?? ""),
        })),
      });
    }

    // Log returned/broken diamonds into the clean Diamond Return tab.
    const returns: ReturnInput[] = (body.returns || []).map((r) => ({
      date: receivedDate,
      description: String(r.description || "").trim() || "Unused",
      shape: String(r.shape || "").trim(),
      size: String(r.size || "").trim(),
      caratWeight: String(r.caratWeight || "").trim(),
      pcs: String(r.pcs || "").trim(),
      comments: String(r.comments || "").trim(),
      designNo: designNumber,
      remark: String(r.remark || "").trim(),
    }));
    const returnedCount = await appendReturns(returns);

    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Jewellery in",
        order: designNumber,
        details: `${memos.length} memo(s) · ${returnedCount} return line(s) · ${status}`,
      });
    }

    return NextResponse.json({ ok: true, returnedCount });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to record jewellery in" },
      { status: 500 }
    );
  }
}
