import { NextRequest, NextResponse } from "next/server";
import { isStorageConfigured, logActivity } from "@/lib/sheetStore";
import { savePhotoshoot, PhotoshootRecord } from "@/lib/photoshootStore";
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

  const rec: PhotoshootRecord = {
    stockNo,
    designName: String(body.designName || "").trim(),
    goldColor: String(body.goldColor || "").trim(),
    date: String(body.date || "").trim(),
    rawImages: String(body.rawImages || "").trim(),
    promptA: String(body.promptA || "").trim(),
    promptB: String(body.promptB || "").trim(),
    promptC: String(body.promptC || "").trim(),
    promptD: String(body.promptD || "").trim(),
    video: String(body.video || "").trim(),
    instagramPost: String(body.instagramPost || "").trim(),
    instagramReel: String(body.instagramReel || "").trim(),
    instagramStory: String(body.instagramStory || "").trim(),
    comments: String(body.comments || "").trim(),
  };

  try {
    await savePhotoshoot(rec);
    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Saved photoshoot",
        order: stockNo,
        details: rec.designName ? `${rec.designName}` : `Stock ${stockNo}`,
      });
    }
    return NextResponse.json({ ok: true, stockNo });
  } catch (e) {
    console.error("[photoshoot] save failed:", e instanceof Error ? e.stack || e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save photoshoot" },
      { status: 500 }
    );
  }
}
