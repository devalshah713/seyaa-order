// Where the portal's records live.
//
// Nine JSON documents — memos, PD sheets, demands, the jangad register, QC,
// the stock book, prices, users, the receipt chase — each read whole, changed,
// and written back whole. Every module used to carry its own copy of that
// plumbing against Vercel Blob; this is the one copy, and it can speak to
// either Vercel Blob or Cloudflare R2.
//
// Why it is moving: a billing problem at Vercel took the storage down and, with
// it, every record in the business — the website and the filing cabinet were
// the same account. They become two companies, so losing one costs a deployment
// rather than the ledger.
//
// R2 speaks the S3 protocol, so reaching it is a signed HTTPS request and
// nothing more. aws4fetch does the signing in about ten kilobytes and runs
// unchanged on Vercel today and on Cloudflare Workers after the move — no SDK,
// no Node built-ins, nothing to swap out a second time.
//
// --- Which store is used --------------------------------------------------
//
// Whichever is configured, and during the move both are:
//
//   * R2 alone (the four R2_* variables)      — the destination.
//   * Blob alone (BLOB_READ_WRITE_TOKEN)      — where it started.
//   * Both                                    — R2 is the record. Anything R2
//     has not got yet is read from Blob, and every save is written to both.
//
// The point of the overlap is that the order does not matter. Deploying this
// before the copy has run, or running the copy before the variables are set,
// both work, and neither leaves a window where a module looks empty. When the
// move is finished and confirmed, removing BLOB_READ_WRITE_TOKEN completes it.
import "server-only";
import { AwsClient } from "aws4fetch";
import { get, BlobNotFoundError } from "@vercel/blob";

// --- Which stores are available ----------------------------------------------

const accountId = () => process.env.R2_ACCOUNT_ID || "";
const bucket = () => process.env.R2_BUCKET || "";
const accessKeyId = () => process.env.R2_ACCESS_KEY_ID || "";
const secretAccessKey = () => process.env.R2_SECRET_ACCESS_KEY || "";

export function hasR2(): boolean {
  return !!(accountId() && bucket() && accessKeyId() && secretAccessKey());
}

export function hasBlob(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

// What every module asks before it offers a screen. Either store will do — a
// portal running on one of them is configured, whichever one it is.
export function isDbConfigured(): boolean {
  return hasR2() || hasBlob();
}

// Which settings are missing, by name, so a half-finished setup is diagnosable
// from the screen rather than by elimination.
//
// Naming only the ones actually absent matters more than it looks: the usual
// failure is one misspelled name out of four, and a message that lists all four
// every time sends you round the loop re-checking the three that were right.
export function dbSetupHint(): string {
  if (isDbConfigured()) return "";

  const missing = ([
    ["R2_ACCOUNT_ID", accountId()],
    ["R2_BUCKET", bucket()],
    ["R2_ACCESS_KEY_ID", accessKeyId()],
    ["R2_SECRET_ACCESS_KEY", secretAccessKey()],
  ] as const).filter(([, value]) => !value).map(([name]) => name);

  const list =
    missing.length > 1
      ? `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`
      : missing[0];

  return missing.length === 4
    ? `Storage is not configured. Set ${list}, then redeploy.`
    : `Storage is not configured: ${list} ${missing.length > 1 ? "are" : "is"} missing. Check the spelling against the list in the README — a misspelled name reads as absent. Then redeploy.`;
}

// --- The R2 connection --------------------------------------------------------

// Built once per process rather than per call: signing keys are derived from
// the secret, and there is no reason to redo that work on every page view.
let signer: AwsClient | null = null;
function aws(): AwsClient {
  if (!signer) {
    signer = new AwsClient({
      accessKeyId: accessKeyId(),
      secretAccessKey: secretAccessKey(),
      service: "s3",
      region: "auto",
    });
  }
  return signer;
}

function objectUrl(path: string): string {
  return `https://${accountId()}.r2.cloudflarestorage.com/${bucket()}/${path}`;
}

// --- Reading and writing ------------------------------------------------------

// Read one document.
//
// A document that has never been written is not an error — every module starts
// empty on its first day — so `fallback` is returned instead, exactly as the
// Blob layer did with BlobNotFoundError. So is a document holding something
// other than an object: a truncated or hand-edited file should read as "nothing
// here yet" rather than throw on every page in the module.
export async function readDoc<T>(path: string, fallback: T): Promise<T> {
  if (hasR2()) {
    // no-store because this is a database, not a page asset: a memo saved a
    // second ago has to be visible to the next person who looks.
    const res = await aws().fetch(objectUrl(path), { method: "GET", cache: "no-store" });
    if (res.ok) {
      const parsed = (await res.json().catch(() => null)) as T | null;
      return parsed && typeof parsed === "object" ? parsed : fallback;
    }
    // Not in R2 yet. If the old store is still there it is the one that knows.
    if (res.status !== 404) {
      throw new Error(`Could not read ${path} from storage (${res.status}).`);
    }
    return hasBlob() ? readFromBlob(path, fallback) : fallback;
  }

  if (hasBlob()) return readFromBlob(path, fallback);
  throw new Error(dbSetupHint());
}

// Write one document, whole.
//
// While both stores are configured this writes to both, so the old one stays a
// complete, current copy and abandoning the move is a matter of unsetting four
// variables rather than restoring a backup.
export async function writeDoc(path: string, value: unknown): Promise<void> {
  const body = JSON.stringify(value);

  if (hasR2()) {
    const res = await aws().fetch(objectUrl(path), {
      method: "PUT",
      body,
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) throw new Error(`Could not save ${path} to storage (${res.status}).`);
    // R2 holds the record now, so a failed mirror costs the rollback copy its
    // last change — worth strictly less than refusing the save.
    await writeToBlob(path, body).catch(() => {});
    return;
  }

  if (hasBlob()) return writeToBlob(path, body);
  throw new Error(dbSetupHint());
}

// Is this document in R2 yet? Used by the one-off migration to report what it
// found without pulling every record into memory.
export async function docExists(path: string): Promise<boolean> {
  if (!hasR2()) return false;
  const res = await aws().fetch(objectUrl(path), { method: "HEAD" });
  return res.ok;
}

// --- The old store ------------------------------------------------------------

// "Not there" is an answer; anything else is not.
//
// This distinction is the whole safety of the move. While both stores are
// configured, this is the only thing that knows whether a module is genuinely
// empty — and every screen does read, change, write. A store that cannot be
// reached, read as "empty", would put a blank document back over a full one the
// next time somebody saved. So only a clean "no such document" is allowed to
// read as empty; a store that is unreachable, refusing, or suspended is an
// error, and the page says so instead of quietly showing nothing.
async function readFromBlob<T>(path: string, fallback: T): Promise<T> {
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  if (!token) return fallback;
  try {
    const result = await get(path, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return fallback;
    const parsed = (await new Response(result.stream).json()) as T | null;
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (err) {
    if (err instanceof BlobNotFoundError) return fallback;
    throw err;
  }
}

async function writeToBlob(path: string, body: string): Promise<void> {
  const token = process.env.BLOB_READ_WRITE_TOKEN || "";
  if (!token) return;
  const { put } = await import("@vercel/blob");
  await put(path, body, {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
