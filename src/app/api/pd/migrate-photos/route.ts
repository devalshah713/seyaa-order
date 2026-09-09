import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { requireAdmin } from "@/lib/currentUser";
import { listPdSheets, setPdPhoto } from "@/lib/pdStore";
import { uploadToCloudinary } from "@/lib/cloudinary";

// A one-off: moves every design photo still living in the private Blob store
// across to Cloudinary, and points its sheet at the new URL.
//
// TEMPORARY. Delete this file, and /api/upload and /api/photo with it, once it
// has been run and the report comes back with nothing left to move.
//
// Safe to run more than once. It only touches sheets whose photoPath is not
// already a URL, so a second run finds nothing to do; and a run that dies
// halfway leaves the sheets it already moved pointing at Cloudinary and the
// rest pointing at Blob, both of which display correctly.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Each photo is a download and an upload. A few hundred would outlast any
// timeout, so the work is capped per call and the report says what is left.
export const maxDuration = 300;

const BATCH = 25;

type Moved = { id: string; pdNo: string; sku: string; from: string; to?: string; error?: string };

export async function POST(): Promise<NextResponse> {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admins only." }, { status: 403 });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "BLOB_READ_WRITE_TOKEN is not set, so the old photos cannot be read." },
      { status: 501 }
    );
  }

  let sheets;
  try {
    sheets = await listPdSheets();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the PD sheets." },
      { status: 503 }
    );
  }

  // Anything already on a URL is done; anything with no photo has nothing to do.
  const pending = sheets.filter((s) => {
    const p = (s.photoPath || "").trim();
    return p !== "" && !p.startsWith("http");
  });

  const moved: Moved[] = [];
  for (const sheet of pending.slice(0, BATCH)) {
    const from = sheet.photoPath;
    const row: Moved = { id: sheet.id, pdNo: sheet.pdNo, sku: sheet.sku, from };
    try {
      const found = await get(from, { access: "private", token, useCache: false });
      if (!found || found.statusCode !== 200 || !found.stream) {
        throw new Error("not in the blob store any more");
      }
      const bytes = await new Response(found.stream).blob();
      const name = from.split("/").pop() || `${sheet.id}.jpg`;

      const shot = await uploadToCloudinary(bytes, name);
      await setPdPhoto(sheet.id, shot.secure_url, shot.public_id);
      row.to = shot.secure_url;
    } catch (err) {
      // One unreadable photo must not stop the rest. The sheet keeps pointing
      // at Blob, which still displays, and the report names it.
      row.error = err instanceof Error ? err.message : "could not be moved";
    }
    moved.push(row);
  }

  const done = moved.filter((m) => m.to).length;
  return NextResponse.json({
    sheets: sheets.length,
    stillOnBlobBefore: pending.length,
    attempted: moved.length,
    moved: done,
    failed: moved.length - done,
    remaining: pending.length - done,
    detail: moved,
  });
}
