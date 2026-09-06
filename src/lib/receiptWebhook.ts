// The outbound half of the receipt chase: the same events the portal records
// are posted to the Grok Bot, so Deval is told where he actually is rather
// than only in a screen nobody has open.
//
// Every post carries `messageText` — the whole chase note, already written and
// laid out — because what happens next is a person copying it into the
// "Diamond bagging group internal" WhatsApp group by hand. Nothing here sends
// a WhatsApp message; it only produces something ready to be forwarded.
//
// Three events, all the same shape:
//   demand.issued    a demand went to the diamond team and is now being watched
//   receipt.reminder nothing on the jangad yet — this is reminder number n
//   receipt.done     a jangad issue entry exists, the chase is closed
//
// Nothing here ever throws: a webhook that is unreachable must not stop a
// demand saving or a reminder being recorded. The result is returned so the
// caller can write down what happened.
import "server-only";
import { elapsedHours, elapsedWords, istDate, istStampOffset } from "./chaseTime";
import type { ReceiptChase } from "./receiptChase";

export type ReceiptEventName = "demand.issued" | "receipt.reminder" | "receipt.done";

export type ReceiptPost = {
  event: ReceiptEventName;
  designNumber: string;
  demandId: string;
  demandNo: string;
  demandDate: string;
  issuedAt: string; // with India's offset on it
  elapsedHours: number;
  reminderNumber?: number;
  completedAt?: string;
  jangadRef?: string;
  messageText: string;
  // Not in the agreed payload, but harmless to a receiver that ignores it and
  // the only way a Grok routine can tell two posts of the same reminder apart
  // from two different reminders.
  idempotencyKey: string;
};

export type PostResult = {
  ok: boolean;
  skipped?: boolean; // no webhook configured
  status?: number;
  attempts: number;
  error?: string;
};

export function isReceiptWebhookConfigured(): boolean {
  return !!process.env.GROK_DIAMOND_RECEIPT_WEBHOOK_URL;
}

// The block Deval forwards. Every line the office asked for, in the order they
// asked for it, and nothing else — it is going into a WhatsApp group, not a
// report.
export function buildMessageText(
  chase: ReceiptChase,
  kind: ReceiptEventName,
  now: Date,
  reminderNumber?: number
): string {
  const waited = elapsedWords(chase.issuedAt, now);
  if (kind === "receipt.done") {
    return [
      "Diamond receipt confirmed",
      `Design: ${chase.designNumber}`,
      `Demand: ${chase.demandNo} | Issued: ${istDate(chase.issuedAt)}`,
      `Received on Jangad after ${waited}${chase.jangadRef ? ` (${chase.jangadRef})` : ""}`,
      "No further chasing needed.",
    ].join("\n");
  }
  if (kind === "demand.issued") {
    return [
      "Diamond demand issued",
      `Design: ${chase.designNumber}`,
      `Demand: ${chase.demandNo} | Issued: ${istDate(chase.issuedAt)}`,
      `To: ${chase.issuedTo || "Diamond Dept"}`,
      "Waiting for the bags to be issued on Jangad.",
    ].join("\n");
  }
  return [
    "Diamond receipt chase",
    `Design: ${chase.designNumber}`,
    `Demand: ${chase.demandNo} | Issued: ${istDate(chase.issuedAt)}`,
    `Waiting: ${waited} since issued to Diamond Dept`,
    "Status: Still not on Jangad issue",
    `Reminder: #${reminderNumber ?? chase.reminderNumber + 1}`,
    "Please confirm / issue bags.",
  ].join("\n");
}

export function buildPost(
  chase: ReceiptChase,
  event: ReceiptEventName,
  extra: { reminderNumber?: number; now?: Date } = {}
): ReceiptPost {
  const now = extra.now || new Date();
  const messageText = buildMessageText(chase, event, now, extra.reminderNumber);
  return {
    event,
    designNumber: chase.designNumber,
    demandId: chase.demandId,
    demandNo: chase.demandNo,
    demandDate: chase.demandDate,
    issuedAt: istStampOffset(chase.issuedAt),
    elapsedHours: elapsedHours(chase.issuedAt, now),
    reminderNumber: event === "receipt.reminder" ? extra.reminderNumber : undefined,
    completedAt: event === "receipt.done" ? istStampOffset(chase.completedAt || now.toISOString()) : undefined,
    jangadRef: event === "receipt.done" ? chase.jangadRef : undefined,
    messageText,
    idempotencyKey:
      event === "receipt.reminder"
        ? `${chase.id}:${event}:${extra.reminderNumber}`
        : `${chase.id}:${event}`,
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A single attempt, with its own timeout so a webhook that accepts the
// connection and then says nothing cannot hold the worker open.
async function attempt(url: string, auth: string, post: ReceiptPost, timeoutMs: number) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": "seyaa-portal-receipt-chase",
    "x-idempotency-key": post.idempotencyKey,
    "x-chase-event": post.event,
  };
  // Sent verbatim as the Grok routine panel gives it — that value already says
  // what scheme it is, so nothing is prepended to it here.
  if (auth) headers.authorization = auth;

  return fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(post),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}

// Retries only what is worth retrying: a network failure, a rate limit, or the
// far end being briefly broken. A 400 or a 403 means the request itself is
// wrong, and sending it again would only be wrong again.
export async function postReceiptEvent(
  post: ReceiptPost,
  opts: { attempts?: number; timeoutMs?: number } = {}
): Promise<PostResult> {
  const url = process.env.GROK_DIAMOND_RECEIPT_WEBHOOK_URL;
  if (!url) return { ok: false, skipped: true, attempts: 0 };

  const auth = process.env.GROK_DIAMOND_RECEIPT_WEBHOOK_AUTH || "";
  const max = Math.max(1, opts.attempts ?? 3);
  const timeoutMs = opts.timeoutMs ?? 8000;
  let last: PostResult = { ok: false, attempts: 0, error: "Not sent." };

  for (let i = 1; i <= max; i++) {
    try {
      const res = await attempt(url, auth, post, timeoutMs);
      if (res.ok) return { ok: true, status: res.status, attempts: i };
      last = {
        ok: false, status: res.status, attempts: i,
        error: `The webhook answered ${res.status}.`,
      };
      if (!(res.status === 429 || res.status >= 500)) return last;
    } catch (err) {
      last = {
        ok: false, attempts: i,
        error: err instanceof Error ? err.message : "Could not reach the webhook.",
      };
    }
    if (i < max) await wait(500 * 3 ** (i - 1)); // 0.5s, then 1.5s
  }
  return last;
}

// One line for the event log, so the chase screen says what became of a ping
// without anyone having to read a server log.
export function resultNote(r: PostResult): string {
  if (r.skipped) return "No Grok Bot webhook is set up, so nothing was sent out.";
  if (r.ok) return `Sent to the Grok Bot${r.attempts > 1 ? ` on attempt ${r.attempts}` : ""}.`;
  return `Grok Bot not reached after ${r.attempts} ${r.attempts === 1 ? "try" : "tries"}: ${r.error}`;
}
