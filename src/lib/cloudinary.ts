// Where design photos live.
//
// They used to go through /api/upload into the private Vercel Blob store and
// come back out through /api/photo. They now go straight from the designer's
// browser to Cloudinary, which keeps the image off the portal's own bandwidth
// entirely — it was the photos, not the data, that ate a month of Blob
// allowance in six weeks.
//
// Neither of these is a secret. The upload preset is unsigned by design: it
// has to be readable in the page for a browser to post with it. The trade is
// that anyone who reads the page source can upload to this Cloudinary account,
// which the owner has accepted; the preset can be disabled in Cloudinary if it
// is ever abused.
//
// Deliberately free of "server-only" — the upload happens in the browser and
// the URL rule below is needed on both sides.
export const CLOUD_NAME = "eneswm2s";
export const UPLOAD_PRESET = "seyaa-order";

export const UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// What Cloudinary hands back that we keep.
export type CloudinaryUpload = { secure_url: string; public_id: string };

// Turn a stored photoPath into something an <img> can load.
//
// One rule, used everywhere a photo is shown, because there are two kinds of
// stored value and will be until the migration has run over every old sheet:
//
//   "https://res.cloudinary.com/…"  a Cloudinary URL — load it directly
//   "pd-photos/1725…-a1b2c3.jpg"    a Blob pathname — serve it through the app
//
// Sheets written before the switch keep working untouched, and a sheet edited
// after it quietly moves across when its photo is replaced.
export function photoSrc(photoPath: string | null | undefined): string {
  const p = (photoPath || "").trim();
  if (!p) return "";
  if (p.startsWith("http")) return p;
  return `/api/photo?p=${encodeURIComponent(p)}`;
}

// Send one image to Cloudinary and hand back what to store. Used by the
// browser when a designer picks a photo, and by the one-off migration on the
// server when it moves an old one across — same endpoint, same preset, so
// there is only one way a photo can arrive.
export async function uploadToCloudinary(
  file: Blob,
  filename: string
): Promise<CloudinaryUpload> {
  const form = new FormData();
  form.append("file", file, filename);
  form.append("upload_preset", UPLOAD_PRESET);

  const res = await fetch(UPLOAD_URL, { method: "POST", body: form });
  const data = (await res.json().catch(() => null)) as
    | (Partial<CloudinaryUpload> & { error?: { message?: string } })
    | null;

  if (!res.ok || !data?.secure_url) {
    throw new Error(data?.error?.message || `Cloudinary refused the upload (${res.status}).`);
  }
  return { secure_url: data.secure_url, public_id: data.public_id || "" };
}
