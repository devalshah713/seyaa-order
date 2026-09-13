// The receipt chase list: one row per design number on a diamond demand that
// has gone to the diamond team and not yet come back as a jangad issue entry.
//
// Same shared-storage pattern as demandStore and jangadStore, in its own
// JSON document. The rows are durable on purpose — a reminder due in six hours
// cannot be a setTimeout, because nothing on a serverless host is still
// running six hours from now. The row says when the next reminder is due, and
// a worker that runs every few minutes (/api/receipt-chase/tick) sends
// whatever has come due since it last looked. That makes the chase survive
// deploys, restarts, and a portal nobody has opened all day.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
import { dueAt, MAX_REMINDERS } from "./chaseTime";
import {
  chaseId, isOpen,
  type ReceiptChase, type ReceiptChaseEvent,
} from "./receiptChase";

const DB_PATH = "receipt-chase/db.json";

export {
  chaseId, isOpen, isOpenStatus, OPEN_STATUSES, STATUS_LABEL,
} from "./receiptChase";
export type {
  ReceiptChase, ReceiptChaseEvent, ReceiptChaseStatus,
} from "./receiptChase";

export type ReceiptChaseDB = { chases: ReceiptChase[] };

// The event log is a trail, not an archive — enough to see what happened
// without the document growing without limit.
const MAX_EVENTS = 60;

export function isReceiptChaseStorageConfigured(): boolean {
  return isDbConfigured();
}

async function readDB(): Promise<ReceiptChaseDB> {
  const db = await readDoc<Partial<ReceiptChaseDB>>(DB_PATH, {});
  return { chases: db.chases || [] };
}

async function writeDB(db: ReceiptChaseDB): Promise<void> {
  await writeDoc(DB_PATH, db);
}

function note(c: ReceiptChase, event: ReceiptChaseEvent): void {
  c.events.push(event);
  if (c.events.length > MAX_EVENTS) c.events = c.events.slice(-MAX_EVENTS);
  c.updatedAt = event.at;
}

// --- Reading -----------------------------------------------------------------

export async function listReceiptChases(): Promise<ReceiptChase[]> {
  const db = await readDB();
  // Open ones first, then the most recently touched.
  return db.chases.slice().sort((a, b) => {
    const openness = Number(isOpen(b)) - Number(isOpen(a));
    if (openness) return openness;
    return a.updatedAt < b.updatedAt ? 1 : -1;
  });
}

export async function getReceiptChase(id: string): Promise<ReceiptChase | null> {
  const db = await readDB();
  return db.chases.find((c) => c.id === id) || null;
}

// Issued and still not received, for the badge on the Demands screen.
export async function openReceiptCount(): Promise<number> {
  const db = await readDB();
  return db.chases.filter(isOpen).length;
}

// --- Writing -----------------------------------------------------------------

// Read, change, write. Every write goes through here so the document is only
// ever rewritten whole and a caller cannot forget to stamp updatedAt.
async function mutate<T>(fn: (db: ReceiptChaseDB) => T): Promise<T> {
  const db = await readDB();
  const out = fn(db);
  await writeDB(db);
  return out;
}

export type NewReceiptChase = {
  demandId: string;
  demandNo: string;
  demandDate: string;
  designNumber: string;
  issuedTo: string;
  pdNo: string;
  issuedAt: string;
};

// Start waiting on one design number of one demand. Returns the chases that
// were actually new — saving the same demand twice must not chase it twice.
export async function openReceiptChases(
  inputs: NewReceiptChase[],
  by: string
): Promise<ReceiptChase[]> {
  if (!inputs.length) return [];
  const nowIso = new Date().toISOString();
  return mutate((db) => {
    const made: ReceiptChase[] = [];
    for (const input of inputs) {
      const id = chaseId(input.demandId, input.designNumber);
      if (db.chases.some((c) => c.id === id)) continue;
      const chase: ReceiptChase = {
        ...input,
        id,
        status: "watching",
        reminderNumber: 0,
        nextReminderAt: dueAt(new Date(Date.parse(input.issuedAt)), 1).toISOString(),
        events: [],
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      note(chase, {
        at: nowIso,
        kind: "opened",
        note: `Demand ${input.demandNo} issued to ${input.issuedTo || "the diamond team"} — waiting for the bags on the jangad.`,
        by,
      });
      db.chases.push(chase);
      made.push(chase);
    }
    return made;
  });
}

// Record that a reminder went out, and work out when the next one is due.
// Called only by the worker, which has already decided this one is due.
export async function recordReminder(
  id: string,
  n: number,
  messageText: string,
  webhookNote: string
): Promise<ReceiptChase | null> {
  const now = new Date();
  const at = now.toISOString();
  return mutate((db) => {
    const c = db.chases.find((x) => x.id === id);
    if (!c) return null;
    c.reminderNumber = n;
    c.lastRemindedAt = at;
    c.lastMessageText = messageText;
    c.status = n >= MAX_REMINDERS ? "paused" : "reminding";
    c.nextReminderAt = dueAt(now, n + 1).toISOString();
    note(c, {
      at, kind: "reminder", n,
      note: `Reminder ${n} sent.${webhookNote ? ` ${webhookNote}` : ""}`,
    });
    if (c.status === "paused") {
      note(c, {
        at, kind: "paused",
        note: `Chased ${MAX_REMINDERS} times with nothing on the jangad — paused, waiting for a decision.`,
      });
    }
    return c;
  });
}

export async function closeReceiptChase(
  id: string,
  outcome: "done" | "cancelled",
  by: string,
  detail: string,
  jangadRef = ""
): Promise<ReceiptChase | null> {
  const at = new Date().toISOString();
  return mutate((db) => {
    const c = db.chases.find((x) => x.id === id);
    if (!c || !isOpen(c)) return null;
    c.status = outcome;
    c.completedAt = at;
    c.closedBy = by;
    if (jangadRef) c.jangadRef = jangadRef;
    note(c, { at, kind: outcome === "done" ? "done" : "cancelled", note: detail, by });
    return c;
  });
}

// Puts a paused chase back to work, starting the cadence again from now.
export async function resumeReceiptChase(id: string, by: string): Promise<ReceiptChase | null> {
  const now = new Date();
  const at = now.toISOString();
  return mutate((db) => {
    const c = db.chases.find((x) => x.id === id);
    if (!c || c.status !== "paused") return null;
    c.status = "reminding";
    c.reminderNumber = 0;
    c.nextReminderAt = dueAt(now, 1).toISOString();
    note(c, { at, kind: "resumed", note: "Chase started again by hand.", by });
    return c;
  });
}

// Brings the next reminder forward to now, so "Send reminder now" on the chase
// screen goes through exactly the code a due one does rather than being a
// second way of sending. Working hours do not apply: somebody pressed it.
export async function bringForward(id: string, by: string): Promise<ReceiptChase | null> {
  const at = new Date().toISOString();
  return mutate((db) => {
    const c = db.chases.find((x) => x.id === id);
    if (!c || !isOpen(c)) return null;
    if (c.status === "paused") c.status = "reminding";
    c.nextReminderAt = at;
    note(c, { at, kind: "reminder", note: "Reminder asked for by hand.", by });
    return c;
  });
}

// For the nightly backup.
export async function exportReceiptChaseDb(): Promise<ReceiptChaseDB> {
  return readDB();
}
