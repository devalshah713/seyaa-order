// The one-off copy of every record from Vercel Blob to Cloudflare R2.
//
// Nine documents, copied byte for byte. Nothing is deleted and nothing is
// interpreted on the way across: a document that reads as JSON in the old store
// reads as the same JSON in the new one, and anything the portal could open
// before it can open after.
//
// Safe to run more than once. A document already in R2 is left alone unless
// asked for again, so a run interrupted half way is finished by running it
// again rather than started over.
//
// This exists to be deleted. Once the move is confirmed and the Blob token is
// unset, it has nothing left to do — see the note in db.ts about what unsetting
// that variable means.
import "server-only";
import { get, BlobNotFoundError } from "@vercel/blob";
import { AwsClient } from "aws4fetch";
import { docExists, hasBlob, hasR2 } from "./db";

// Every document the portal keeps, in the order a person would check them.
export const DOCUMENTS = [
  { path: "users/users.json", label: "User accounts" },
  { path: "memos/db.json", label: "Memos, orders and parties" },
  { path: "pd/db.json", label: "PD sheets" },
  { path: "demand/db.json", label: "Diamond demands" },
  { path: "jangad/db.json", label: "Jangad register" },
  { path: "stockbook/db.json", label: "Stock book" },
  { path: "qc/db.json", label: "QC records" },
  { path: "prices/db.json", label: "Price list" },
  { path: "receipt-chase/db.json", label: "Diamond receipt chase" },
] as const;

export type DocumentResult = {
  path: string;
  label: string;
  did: "copied" | "already there" | "nothing to copy" | "failed";
  bytes: number;
  note: string;
};

export type MigrationReport = {
  at: string;
  copied: number;
  skipped: number;
  missing: number;
  failed: number;
  documents: DocumentResult[];
};

export function isMigrationPossible(): boolean {
  return hasR2() && hasBlob();
}

export function migrationHint(): string {
  if (!hasR2()) {
    return "Cloudflare R2 is not configured yet — set the four R2_* variables and redeploy. Until then the portal keeps running on the old Vercel store, exactly as before.";
  }
  if (!hasBlob()) {
    return "There is no Vercel Blob store left to copy from. If the move is already finished, this is what it should say.";
  }
  return "";
}

// Read one document out of the old store as raw text, so nothing is reshaped on
// the way across. Null means the old store hasn't got it — a module nobody has
// used yet, which is not a failure.
async function readBlobText(path: string, token: string): Promise<string | null> {
  try {
    const result = await get(path, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return await new Response(result.stream).text();
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    throw err;
  }
}

// Written with its own client rather than through writeDoc(), because writeDoc
// mirrors every save back to Blob while the move is in progress. Copying a
// document out of Blob only to write it straight back is pointless work on the
// store this is trying to leave.
function r2(): AwsClient {
  return new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    service: "s3",
    region: "auto",
  });
}

function objectUrl(path: string): string {
  const account = process.env.R2_ACCOUNT_ID || "";
  const bucket = process.env.R2_BUCKET || "";
  return `https://${account}.r2.cloudflarestorage.com/${bucket}/${path}`;
}

// Copy everything across.
//
// `overwrite` is off by default so that running this a second time cannot undo
// a day's work: once the portal is writing to R2, the R2 copy is the newer one,
// and putting the Blob copy back over it would lose whatever happened in
// between. It is there for the one case that needs it — a first copy that went
// wrong and has to be done again before anyone starts using the portal.
export async function migrateToR2(overwrite = false): Promise<MigrationReport> {
  const hint = migrationHint();
  if (hint) throw new Error(hint);

  const token = process.env.BLOB_READ_WRITE_TOKEN!;
  const client = r2();
  const report: MigrationReport = {
    at: new Date().toISOString(),
    copied: 0, skipped: 0, missing: 0, failed: 0,
    documents: [],
  };

  for (const doc of DOCUMENTS) {
    const result: DocumentResult = {
      path: doc.path, label: doc.label, did: "failed", bytes: 0, note: "",
    };
    try {
      if (!overwrite && (await docExists(doc.path))) {
        result.did = "already there";
        result.note = "Already in R2 — left alone.";
        report.skipped++;
        report.documents.push(result);
        continue;
      }

      const text = await readBlobText(doc.path, token);
      if (text === null) {
        result.did = "nothing to copy";
        result.note = "Not in the old store — this module has no records yet.";
        report.missing++;
        report.documents.push(result);
        continue;
      }

      const res = await client.fetch(objectUrl(doc.path), {
        method: "PUT",
        body: text,
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) throw new Error(`R2 refused the write (${res.status}).`);

      result.did = "copied";
      result.bytes = new TextEncoder().encode(text).length;
      result.note = `Copied ${result.bytes.toLocaleString()} bytes.`;
      report.copied++;
    } catch (err) {
      result.did = "failed";
      result.note = err instanceof Error ? err.message : "Unknown error.";
      report.failed++;
    }
    report.documents.push(result);
  }

  return report;
}

// What is where, without copying anything. Worth looking at before pressing the
// button, and again afterwards.
export async function compareStores(): Promise<DocumentResult[]> {
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  const out: DocumentResult[] = [];

  for (const doc of DOCUMENTS) {
    const result: DocumentResult = {
      path: doc.path, label: doc.label, did: "nothing to copy", bytes: 0, note: "",
    };
    try {
      const inR2 = hasR2() ? await docExists(doc.path) : false;
      const blobText = token ? await readBlobText(doc.path, token) : null;
      const blobBytes = blobText === null ? 0 : new TextEncoder().encode(blobText).length;

      result.bytes = blobBytes;
      if (inR2 && blobText !== null) {
        result.did = "already there";
        result.note = `In both. Old store holds ${blobBytes.toLocaleString()} bytes.`;
      } else if (inR2) {
        result.did = "already there";
        result.note = "In R2 only — nothing left in the old store.";
      } else if (blobText !== null) {
        result.did = "nothing to copy";
        result.note = `Still only in the old store (${blobBytes.toLocaleString()} bytes).`;
      } else {
        result.note = "In neither — this module has no records yet.";
      }
    } catch (err) {
      result.did = "failed";
      result.note = err instanceof Error ? err.message : "Unknown error.";
    }
    out.push(result);
  }
  return out;
}
