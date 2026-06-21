import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import {
  createIssue,
  listIssues,
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
      used: used.map((u: { ctsUsed?: string; pcsUsed?: string }) => ({
        ctsUsed: String(u?.ctsUsed ?? ""),
        pcsUsed: String(u?.pcsUsed ?? ""),
      })),
    });
    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Updated diamond issue",
        order: memoNo,
        details: `status ${status}`,
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
    return NextResponse.json({ error: "Add at least one diamond line" }, { status: 400 });

  // Reject a duplicate Memo No. so two issues never collide on the same key.
  try {
    const existing = await listIssues();
    if (existing.some((i) => i.memoNo === memoNo)) {
      return NextResponse.json(
        { error: `Memo No. "${memoNo}" already exists. Please use a different one.` },
        { status: 409 }
      );
    }
  } catch {
    // If the lookup fails, continue — the write will still be attempted.
  }

  // Keep only lines that have a shape; require all mandatory fields on those.
  const lines: IssueLine[] = [];
  for (const ln of body.lines) {
    const values = ln.values || {};
    if (!values["Diamond Shape"]) continue;
    for (const f of ISSUE_LINE_FIELDS) {
      if (f.required && !(values[f.name] && String(values[f.name]).trim())) {
        return NextResponse.json(
          { error: `"${f.name}" is required for each diamond line (${values["Diamond Shape"]}).` },
          { status: 400 }
        );
      }
    }
    const clean: Record<string, string> = {};
    for (const f of ISSUE_LINE_FIELDS) clean[f.name] = values[f.name] ? String(values[f.name]) : "";
    lines.push({ values: clean });
  }

  if (!lines.length)
    return NextResponse.json({ error: "Add at least one diamond line with a shape" }, { status: 400 });

  const issue: NewIssue = {
    memoNo,
    designNumber: String(body.designNumber).trim(),
    subDesignNo: String(body.subDesignNo || "").trim(),
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
        order: memoNo,
        details: `${issue.designNumber} · ${lines.length} line(s)`,
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
