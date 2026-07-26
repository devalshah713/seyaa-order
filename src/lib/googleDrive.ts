import "server-only";

// Minimal Google Drive integration over the REST API (no googleapis dependency).
// Uses an OAuth refresh token to obtain short-lived access tokens, then uploads
// each memo PDF into a folder. With the default `drive.file` scope the app can
// only see files it created, so it manages its own "Seyaa Memos" folder. Set
// GOOGLE_DRIVE_FOLDER_ID to target a specific existing folder (that needs the
// broader `drive` scope when authorizing).

const FOLDER_NAME = "Seyaa Memos";

export function isDriveConfigured(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

export function driveScope(): string {
  // drive.file = least privilege (app-created files only). If a specific
  // pre-existing folder is targeted, full drive scope is needed instead.
  return process.env.GOOGLE_DRIVE_FOLDER_ID
    ? "https://www.googleapis.com/auth/drive"
    : "https://www.googleapis.com/auth/drive.file";
}

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google auth failed.");
  }
  return data.access_token as string;
}

async function driveFetch(token: string, url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

async function ensureFolder(token: string): Promise<string> {
  if (process.env.GOOGLE_DRIVE_FOLDER_ID) return process.env.GOOGLE_DRIVE_FOLDER_ID;

  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const found = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`
  ).then((r) => r.json());
  if (found.files?.length) return found.files[0].id as string;

  const created = await driveFetch(token, "https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  }).then((r) => r.json());
  return created.id as string;
}

export type DriveUpload = { id: string; link: string };

// Create the PDF in the folder, or overwrite the existing file of the same name
// (so re-saving/editing a memo keeps one file, not duplicates).
export async function uploadMemoPdf(name: string, pdf: Buffer): Promise<DriveUpload> {
  const token = await getAccessToken();
  const folderId = await ensureFolder(token);

  const safeName = name.replace(/'/g, "");
  const q = encodeURIComponent(
    `name='${safeName}' and '${folderId}' in parents and trashed=false`
  );
  const existing = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`
  ).then((r) => r.json());
  const existingId: string | undefined = existing.files?.[0]?.id;

  let fileId: string;
  if (existingId) {
    // Overwrite content of the existing file.
    const updated = await driveFetch(
      token,
      `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&fields=id,webViewLink`,
      { method: "PATCH", headers: { "Content-Type": "application/pdf" }, body: new Uint8Array(pdf) }
    ).then((r) => r.json());
    fileId = updated.id;
    if (updated.webViewLink) return { id: fileId, link: updated.webViewLink };
  } else {
    const boundary = "seyaa_memo_boundary_9c1f";
    const metadata = { name, parents: [folderId], mimeType: "application/pdf" };
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
      Buffer.from(JSON.stringify(metadata)),
      Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
      pdf,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const created = await driveFetch(
      token,
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body: new Uint8Array(body),
      }
    ).then((r) => r.json());
    fileId = created.id;
    if (created.webViewLink) return { id: fileId, link: created.webViewLink };
  }

  // Fallback: fetch the link if the upload response didn't include it.
  const meta = await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,webViewLink`
  ).then((r) => r.json());
  return { id: fileId, link: meta.webViewLink || `https://drive.google.com/file/d/${fileId}/view` };
}

// --- One-time authorization helpers (to obtain a refresh token) ---
export function authUrl(redirectUri: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: driveScope(),
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.refresh_token) {
    throw new Error(
      data.error_description ||
        "No refresh token returned. Remove the app's access at myaccount.google.com/permissions and try again."
    );
  }
  return data.refresh_token as string;
}
