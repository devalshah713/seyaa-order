// Where design photos live.
//
// They go straight from the designer's browser to Cloudinary, which keeps the
// image off the portal's own bandwidth entirely — it was the photos, not the
// data, that ate a month of Vercel Blob allowance in six weeks. They used to be
// uploaded through the portal and served back out of it; both of those routes
// are gone, and every old photo has been moved across.
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
// Every photo is now a URL. Anything else is a leftover Blob pathname from
// before the move, and there is no longer a route that could serve it — so it
// is treated as no photo at all. That shows the sheet's empty photo box rather
// than a broken image, which is the more honest of the two: the file genuinely
// is not reachable any more.
//
// Kept as a function rather than reading photoPath directly so that every
// screen still goes through one place if photos ever move again.
export function photoSrc(photoPath: string | null | undefined): string {
  const p = (photoPath || "").trim();
  return p.startsWith("http") ? p : "";
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

// Shrink a camera photo before it goes up, so an upload on a phone's own signal
// finishes. A photo off a phone is several megabytes and nothing in the portal
// shows one larger than about 1,200 pixels.
//
// Anything that goes wrong on the way falls back to sending the file as it is:
// a picture that uploads slowly is better than a picture that does not upload.
//
// Browser only — it draws on a canvas. The order form and the PD sheet each
// still carry their own copy of this, written before there was anywhere shared
// to put it; they could be pointed here.
export async function compressImage(file: File, max = 1200): Promise<Blob> {
  if (file.size < 400_000) return file;
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  try {
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob || file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}
