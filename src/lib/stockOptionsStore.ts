// Staff-added options for the Stock In free-text fields (Gold Details, Location,
// Inch Size), stored as a single JSON file in Vercel Blob so they persist across
// devices and appear for everyone — exactly like custom diamond sizes. The
// app-defined defaults are merged on top at read time.
import { put, list } from "@vercel/blob";
import { DEFAULT_GOLD_DETAILS, DEFAULT_LOCATIONS, DEFAULT_INCH_SIZES } from "./stockConfig";

const BLOB_PATH = "config/stock-options.json";

export type StockOptionKind = "gold" | "location" | "inch";
export type StockOptions = { gold: string[]; location: string[]; inch: string[] };

const DEFAULTS: StockOptions = {
  gold: DEFAULT_GOLD_DETAILS,
  location: DEFAULT_LOCATIONS,
  inch: DEFAULT_INCH_SIZES,
};

export function isValidKind(k: string): k is StockOptionKind {
  return k === "gold" || k === "location" || k === "inch";
}

// Merge defaults + saved, de-duplicated (case-insensitive), defaults first.
function merge(saved: Partial<StockOptions>): StockOptions {
  const out: StockOptions = { gold: [], location: [], inch: [] };
  (["gold", "location", "inch"] as StockOptionKind[]).forEach((k) => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const v of [...DEFAULTS[k], ...((saved?.[k] as string[]) || [])]) {
      const key = v.trim().toLowerCase();
      if (v.trim() && !seen.has(key)) { seen.add(key); list.push(v); }
    }
    out[k] = list;
  });
  return out;
}

async function readSaved(): Promise<Partial<StockOptions>> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return {};
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, token, limit: 100 });
    const blob = blobs.find((b) => b.pathname === BLOB_PATH) || blobs[0];
    if (!blob) return {};
    const res = await fetch(blob.url, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === "object" ? (data as Partial<StockOptions>) : {};
  } catch {
    return {};
  }
}

export async function getStockOptions(): Promise<StockOptions> {
  return merge(await readSaved());
}

export async function addStockOption(kind: StockOptionKind, value: string): Promise<StockOptions> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Option storage is not configured (BLOB_READ_WRITE_TOKEN missing).");

  const saved = await readSaved();
  const existing = (saved[kind] as string[]) || [];
  const isDefault = DEFAULTS[kind].some((d) => d.toLowerCase() === value.toLowerCase());
  const already = existing.some((s) => s.toLowerCase() === value.toLowerCase());
  if (!isDefault && !already) saved[kind] = [...existing, value];

  await put(BLOB_PATH, JSON.stringify(saved), {
    access: "private",
    token,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return merge(saved);
}
