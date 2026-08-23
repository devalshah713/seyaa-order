import "server-only";
import { createSign } from "node:crypto";

// The design-number register, kept in a Google Sheet the office can open.
//
// The portal is the record; the sheet is a copy of it that anyone can read
// without signing in. So it is written whole rather than appended to: every
// sync clears the tab and writes every design number again. That is one more
// API call than appending and it is worth it — an edited sheet, a deleted one
// or a number typed differently all come out right, and running a sync twice
// changes nothing.
//
// Two ways to authenticate, whichever is configured:
//   * a service account (the ordinary way for a server writing to one sheet) —
//     GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY, with the
//     sheet shared to that email as an Editor;
//   * the OAuth refresh token the Drive upload already used, if that is still
//     set up — its scope must include spreadsheets.

const SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export const sheetId = () => process.env.GOOGLE_SHEET_ID || "";
export const sheetTab = () => process.env.GOOGLE_SHEET_TAB || "Design Numbers";

function hasServiceAccount(): boolean {
  return !!(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  );
}

function hasOAuth(): boolean {
  return !!(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_REFRESH_TOKEN
  );
}

export function isSheetConfigured(): boolean {
  return !!sheetId() && (hasServiceAccount() || hasOAuth());
}

// What is missing, said plainly, so a half-finished setup is diagnosable from
// the screen rather than from a stack trace.
export function sheetSetupHint(): string {
  if (!sheetId()) return "GOOGLE_SHEET_ID is not set.";
  if (!hasServiceAccount() && !hasOAuth()) {
    return "No Google credentials. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY.";
  }
  return "";
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// A service account proves itself with a JWT it signs, then trades that for an
// access token.
async function serviceAccountToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  // Keys are pasted into an env var, where the newlines usually arrive escaped.
  const pem = (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || "").replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const jwt = `${header}.${claim}.${b64url(signer.sign(pem))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || "Google would not accept the service account."
    );
  }
  return data.access_token as string;
}

async function refreshTokenToken(): Promise<string> {
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google auth failed.");
  }
  return data.access_token as string;
}

async function accessToken(): Promise<string> {
  return hasServiceAccount() ? serviceAccountToken() : refreshTokenToken();
}

async function sheetsFetch(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // The two that actually happen, said in words rather than in a status code.
    if (res.status === 403) {
      throw new Error(
        "Google refused. Share the sheet with the service account email as an Editor."
      );
    }
    if (res.status === 404) {
      throw new Error("No sheet with that id. Check GOOGLE_SHEET_ID.");
    }
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 250)}`);
  }
  return res;
}

// A tab name in A1 notation. Quoted always — "Stock Book" has a space in it and
// would otherwise be read as a range rather than a name.
const a1 = (tab: string, ref = "") =>
  `'${tab.replace(/'/g, "''")}'${ref ? `!${ref}` : ""}`;

type TabProps = { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } };

// Makes sure the tab exists and is big enough for what is about to go in it, so
// a fresh spreadsheet does not have to be set up by hand first and a wide table
// — QC runs past forty columns — does not fall off the default grid.
async function ensureTab(
  token: string,
  id: string,
  title: string,
  needRows: number,
  needCols: number
): Promise<void> {
  const res = await sheetsFetch(
    token,
    `${id}?fields=sheets.properties(sheetId,title,gridProperties)`
  );
  const data = (await res.json()) as { sheets?: { properties?: TabProps }[] };
  const found = (data.sheets || [])
    .map((s) => s.properties)
    .find((p) => p?.title === title);

  if (!found) {
    await sheetsFetch(token, `${id}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          addSheet: {
            properties: {
              title,
              gridProperties: {
                rowCount: Math.max(needRows + 50, 100),
                columnCount: Math.max(needCols + 5, 26),
              },
            },
          },
        }],
      }),
    });
    return;
  }

  const rowCount = found.gridProperties?.rowCount || 0;
  const colCount = found.gridProperties?.columnCount || 0;
  if (rowCount >= needRows && colCount >= needCols) return;
  // Only ever grown. Shrinking a grid deletes whatever was past the edge, and
  // this sheet is the office's to add columns to if they want them.
  await sheetsFetch(token, `${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [{
        updateSheetProperties: {
          properties: {
            sheetId: found.sheetId,
            gridProperties: {
              rowCount: Math.max(rowCount, needRows + 50, 100),
              columnCount: Math.max(colCount, needCols + 5, 26),
            },
          },
          fields: "gridProperties.rowCount,gridProperties.columnCount",
        },
      }],
    }),
  });
}

// Replaces everything on one tab with these rows, the first being the header.
export async function writeTab(tab: string, rows: string[][]): Promise<number> {
  if (!isSheetConfigured()) throw new Error(sheetSetupHint() || "Google Sheet is not set up.");
  const id = sheetId();
  const token = await accessToken();
  const width = rows.reduce((w, r) => Math.max(w, r.length), 1);
  await ensureTab(token, id, tab, Math.max(rows.length, 1), width);

  // Clearing the whole tab rather than a fixed range: yesterday's copy may have
  // been longer than today's, and a half-cleared tab reads as real data.
  await sheetsFetch(
    token,
    `${id}/values/${encodeURIComponent(a1(tab))}:clear`,
    { method: "POST", body: "{}" }
  );
  if (!rows.length) return 0;
  await sheetsFetch(
    token,
    `${id}/values/${encodeURIComponent(a1(tab, "A1"))}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values: rows }) }
  );
  // The header line, minus itself.
  return Math.max(0, rows.length - 1);
}

// The design-number register's own tab, which is what most of the portal means
// when it says "the sheet".
export async function writeSheet(rows: string[][]): Promise<number> {
  return writeTab(sheetTab(), rows);
}

export function sheetUrl(): string {
  return sheetId() ? `https://docs.google.com/spreadsheets/d/${sheetId()}/edit` : "";
}
