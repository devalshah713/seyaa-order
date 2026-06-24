import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import { saveQc, emailFailedStockNumbers, QcRecord, QcItem } from "@/lib/qcStore";
import { QC_CHECKS, deriveResult } from "@/lib/qcConfig";
import { getCurrentUser } from "@/lib/currentUser";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Storage is not connected yet. The Google Sheet still needs to be linked." },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const stockNo = String(body.stockNo || "").trim();
  if (!stockNo) return NextResponse.json({ error: "Stock No. is required" }, { status: 400 });

  // Normalize the answers against the canonical check list (ignore stray keys).
  const incoming: Record<string, { value?: string; remark?: string }> =
    body.items && typeof body.items === "object" ? body.items : {};
  const items: QcItem[] = QC_CHECKS.map((c) => {
    const raw = incoming[c] || {};
    const v = String(raw.value || "").toUpperCase();
    return { check: c, value: v === "YES" || v === "NO" ? v : "", remark: String(raw.remark || "").trim() };
  });

  const rec: QcRecord = {
    stockNo,
    designName: String(body.designName || "").trim(),
    designNumber: String(body.designNumber || "").trim(),
    goldDetails: String(body.goldDetails || "").trim(),
    location: String(body.location || "").trim(),
    inchSize: String(body.inchSize || "").trim(),
    grossWeight: String(body.grossWeight || "").trim(),
    netWeight: String(body.netWeight || "").trim(),
    totalDiamondWeight: String(body.totalDiamondWeight || "").trim(),
    totalDiaPcs: String(body.totalDiaPcs || "").trim(),
    manufacturerName: String(body.manufacturerName || "").trim(),
    date: String(body.date || "").trim(),
    checkedBy: String(body.checkedBy || "").trim(),
    items,
    result: deriveResult(items.map((i) => i.value)),
    comments: String(body.comments || "").trim(),
  };

  try {
    await saveQc(rec);
    // On a fail, email the owner the list of stock numbers currently failing QC.
    if (rec.result === "FAIL") await emailFailedStockNumbers();
    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "QC checked",
        order: rec.designNumber || stockNo,
        details: `Stock ${stockNo} · ${rec.result}`,
      });
    }
    return NextResponse.json({ ok: true, stockNo, result: rec.result });
  } catch (e) {
    console.error("[qc] save failed:", e instanceof Error ? e.stack || e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save QC" },
      { status: 500 }
    );
  }
}
