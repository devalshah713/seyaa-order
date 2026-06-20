// Custom diamond sizes that staff add on the fly are stored as a single JSON
// file in Vercel Blob, so they persist across devices and appear in the
// dropdown for all future orders. Shape -> list of extra size labels.
import { put, list } from "@vercel/blob";

const BLOB_PATH = "config/custom-diamond-sizes.json";

export type CustomSizes = Record<string, string[]>;

export async function getCustomSizes(): Promise<CustomSizes> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return {};
  try {
    const { blobs } = await list({ prefix: BLOB_PATH, token, limit: 100 });
    const blob = blobs.find((b) => b.pathname === BLOB_PATH) || blobs[0];
    if (!blob) return {};
    const res = await fetch(blob.url, { cache: "no-store" });
    if (!res.ok) return {};
    const data = await res.json();
    return data && typeof data === "object" ? (data as CustomSizes) : {};
  } catch {
    return {};
  }
}

export async function addCustomSize(shape: string, size: string): Promise<CustomSizes> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Photo/size storage is not configured (BLOB_READ_WRITE_TOKEN missing).");

  const current = await getCustomSizes();
  const existing = current[shape] || [];
  if (!existing.some((s) => s.toLowerCase() === size.toLowerCase())) {
    current[shape] = [...existing, size];
  }

  await put(BLOB_PATH, JSON.stringify(current), {
    access: "public",
    token,
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });

  return current;
}
