import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import {
  createIssue,
  getIssue,
  reconcileIssue,
  NewIssue,
  IssueLine,
} from "@/lib/diamondIssueStore";
import { ISSUE_LINE_FIELDS, ISSUE_STATUSES } from "@/lib/diamondIssueConfig";
import { getCurrentUser } from "@/lib/currentUser";

// Reconcile an existing issue (record used carats/pcs, received date, status).
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const memoNo = String(body.memoNo || "").trim();
  const status = String(body.status || "");
  const receivedDate = String(body.receivedDate || "");
  const used = Array.isArray(body.used) ? body.used : [];

  if (!memoNo) return NextResponse.json({ error: "Memo No. is required" }, { status: 400 });
  if (!ISSUE_STATUSES.includes(status as (typeof ISSUE_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    await reconcileIssue({
      memoNo,
      status,
      receivedDate,
      comments: body.comments != null ? String(body.comments) : undefined,
      used: used.map((u: { ctsUsed?: string; pcsUsed?: string }) => ({
        ctsUsed: String(u?.ctsUsed ?? ""),
        pcsUsed: String(u?.pcsUsed ?? ""),
      })),
    });
    const actor = await getCurrentUser();
    if (actor) {
      // Group under the design (order) number so reconciliations show up in
      // the order's Audit Trail; keep the memo in the details.
      const updated = await getIssue(memoNo).catch(() => null);
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Updated diamond issue",
        order: updated?.designNumber || memoNo,
        details: `Memo ${memoNo} · status ${status}`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update issue" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Storage is not connected yet. The Google Sheet still needs to be linked." },
      { status: 503 }
    );
  }

  let body: NewIssue;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const memoNo = String(body.memoNo || "").trim();
  if (!memoNo) return NextResponse.json({ error: "Memo No. is required" }, { status: 400 });
  if (!String(body.designNumber || "").trim())
    return NextResponse.json({ error: "Design Number is required" }, { status: 400 });
  if (!body.lines?.length)
    return NextResponse.json({ error: "Add at least one bag of diamonds" }, { status: 400 });

  // A memo number may be reused / added to: if it already exists, createIssue
  // appends the new bags to it rather than overwriting, so duplicates are fine.

  // Keep only bags that have a shape; require all mandatory fields on those.
  const lines: IssueLine[] = [];
  for (const ln of body.lines) {
    const values = ln.values || {};
    if (!values["Diamond Shape"]) continue;
    for (const f of ISSUE_LINE_FIELDS) {
      if (f.required && !(values[f.name] && String(values[f.name]).trim())) {
        return NextResponse.json(
          { error: `"${f.name}" is required for each bag (${values["Diamond Shape"]}).` },
          { status: 400 }
        );
      }
    }
    const clean: Record<string, string> = {};
    for (const f of ISSUE_LINE_FIELDS) clean[f.name] = values[f.name] ? String(values[f.name]) : "";
    lines.push({ values: clean });
  }

  if (!lines.length)
    return NextResponse.json({ error: "Add at least one bag with a shape" }, { status: 400 });

  const issue: NewIssue = {
    memoNo,
    designNumber: String(body.designNumber).trim(),
    subDesignNo: String(body.subDesignNo || "").trim(),
    factory: String(body.factory || ""),
    date: String(body.date || ""),
    comments: String(body.comments || ""),
    lines,
  };

  try {
    await createIssue(issue);
    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Created diamond issue",
        // Reference the design (order) number so the order-scoped Audit Trail
        // shows every diamond issue made against that order. The memo lives
        // in the details for traceability.
        order: issue.designNumber,
        details: `Memo ${memoNo} · ${lines.length} line(s)`,
      });
    }
    return NextResponse.json({ id: memoNo, memoNo });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save issue" },
      { status: 500 }
    );
  }
}
