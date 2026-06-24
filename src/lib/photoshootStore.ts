// Read/write layer for the "Photoshoot & Marketing" tracker. One row per stock
// piece, keyed by Stock No. Uses the same Apps Script Web App: "listTab" to read
// and "replaceByKey" to create/update a record (auto-creates the tab).
import { sheetCall } from "./sheetStore";
import { PHOTOSHOOT_TAB, PHOTOSHOOT_HEADERS } from "./photoshootConfig";

export type PhotoshootRecord = {
  stockNo: string;
  designName: string;
  goldColor: string;
  date: string; // dd/mm/yyyy (blank = today)
  rawImages: string;
  promptA: string;
  promptB: string;
  promptC: string;
  promptD: string;
  video: string;
  instagramPost: string;
  instagramReel: string;
  instagramStory: string;
  comments: string;
};

const KEY_HEADER = "Stock No.";

function escapeCell(v: string): string {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}
function escapeIdCell(v: string): string {
  return /^\d+$/.test(v) ? "'" + v : escapeCell(v);
}

function today(): string {
  return new Date().toLocaleDateString("en-GB"); // dd/mm/yyyy
}

function toObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => { o[h] = r[i] == null ? "" : String(r[i]); });
    return o;
  });
}

function toRecord(r: Record<string, string>): PhotoshootRecord {
  return {
    stockNo: r["Stock No."] || "",
    designName: r["Design Name"] || "",
    goldColor: r["Gold Color"] || "",
    date: r["Date"] || "",
    rawImages: r["Raw Images"] || "",
    promptA: r["Prompt A"] || "",
    promptB: r["Prompt B"] || "",
    promptC: r["Prompt C"] || "",
    promptD: r["Prompt D"] || "",
    video: r["Video"] || "",
    instagramPost: r["Instagram Post"] || "",
    instagramReel: r["Instagram Reel"] || "",
    instagramStory: r["Instagram Story"] || "",
    comments: r["Comments"] || "",
  };
}

export async function listPhotoshoots(): Promise<PhotoshootRecord[]> {
  try {
    const data = await sheetCall<{ ok: true; headers: string[]; rows: string[][] }>({
      action: "listTab",
      tab: PHOTOSHOOT_TAB,
    });
    const objs = toObjects(data.headers || (PHOTOSHOOT_HEADERS as readonly string[]).slice(), data.rows || []);
    const byStock = new Map<string, PhotoshootRecord>();
    for (const o of objs) {
      if (!o["Stock No."]) continue;
      byStock.set(o["Stock No."], toRecord(o)); // last write wins
    }
    const list = Array.from(byStock.values());
    list.sort((a, b) => b.stockNo.localeCompare(a.stockNo, undefined, { numeric: true }));
    return list;
  } catch (e) {
    console.error("[photoshoot] failed to list:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function getPhotoshoot(stockNo: string): Promise<PhotoshootRecord | null> {
  const all = await listPhotoshoots();
  return all.find((p) => p.stockNo === stockNo) || null;
}

function buildRow(rec: PhotoshootRecord): string[] {
  const get = (h: string): string => {
    switch (h) {
      case "Stock No.": return rec.stockNo;
      case "Design Name": return rec.designName;
      case "Gold Color": return rec.goldColor;
      case "Date": return rec.date || today();
      case "Raw Images": return rec.rawImages;
      case "Prompt A": return rec.promptA;
      case "Prompt B": return rec.promptB;
      case "Prompt C": return rec.promptC;
      case "Prompt D": return rec.promptD;
      case "Video": return rec.video;
      case "Instagram Post": return rec.instagramPost;
      case "Instagram Reel": return rec.instagramReel;
      case "Instagram Story": return rec.instagramStory;
      case "Comments": return rec.comments;
    }
    return "";
  };
  return PHOTOSHOOT_HEADERS.map((h) => (h === "Stock No." ? escapeIdCell(get(h)) : escapeCell(get(h))));
}

// Create or update the photoshoot record for a stock piece (keyed by Stock No.).
export async function savePhotoshoot(rec: PhotoshootRecord): Promise<string> {
  await sheetCall({
    action: "replaceByKey",
    tab: PHOTOSHOOT_TAB,
    keyHeader: KEY_HEADER,
    keyValue: rec.stockNo,
    headers: PHOTOSHOOT_HEADERS,
    rows: [buildRow(rec)],
  });
  return rec.stockNo;
}
