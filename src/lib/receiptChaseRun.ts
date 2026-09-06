// The worker behind the receipt chase, and the two hooks that feed it.
//
// Everything that decides whether to ping anybody lives here, in one place, so
// there is only ever one answer to "have these diamonds turned up yet?" — and
// it is asked against the live register every single time, immediately before
// a reminder goes out. A chase answered in the seconds between the row falling
// due and the worker reaching it sends nothing.
import "server-only";
import { joinDesignNo, sameDesignOrPiece } from "./designNo";
import { stageStarted } from "./jangadConfig";
import type { JangadRow } from "./jangadConfig";
import { listJangad } from "./jangadStore";
import type { Demand } from "./demandStore";
import {
  bringForward, closeReceiptChase, getReceiptChase, isOpen, listReceiptChases,
  openReceiptChases, recordReminder,
  type NewReceiptChase,
} from "./receiptChaseStore";
import type { ReceiptChase } from "./receiptChase";
import { buildPost, postReceiptEvent, resultNote } from "./receiptWebhook";

// Every way a jangad row writes the design it belongs to. The register splits
// a piece across two columns — "SN-BR-AMF-10CT" and "63" — so the joined piece
// number and the whole run both have to be tried.
function designsOnRow(row: JangadRow): string[] {
  return [
    row.runNo || "",
    joinDesignNo(row.designNo, row.subDesignNo, ""),
    row.designNo,
  ].filter(Boolean);
}

// Has this design been issued on the jangad?
//
// The design number is what settles it: a demand covers several designs and
// three of them arriving is not all of them. The demand number, when the row
// carries one, only has to agree — a row issued against a different demand for
// the same design still means the diamonds are in, which is the thing being
// waited on.
export function jangadAnswers(chase: ReceiptChase, row: JangadRow): boolean {
  if (!stageStarted(row, "issue")) return false;
  return designsOnRow(row).some((d) => sameDesignOrPiece(chase.designNumber, d));
}

export function findJangadIssue(chase: ReceiptChase, rows: JangadRow[]): JangadRow | null {
  return rows.find((r) => jangadAnswers(chase, r)) || null;
}

// How the register entry is named in the webhook and the log.
function refFor(row: JangadRow): string {
  const piece = joinDesignNo(row.designNo, row.subDesignNo, "");
  return [row.id, piece, row.date].filter(Boolean).join(" · ");
}

// --- The hooks ---------------------------------------------------------------

// Called when a diamond demand is saved. One chase per design number on it.
//
// The clock starts at the moment the demand was recorded rather than the date
// written on it: a demand entered a week late would otherwise be overdue
// before it was saved, and everyone would be chased about diamonds that are
// already in the building.
export async function startReceiptChasesQuietly(demand: Demand, by: string): Promise<void> {
  try {
    const seen = new Set<string>();
    const inputs: NewReceiptChase[] = [];
    for (const row of demand.rows) {
      const design = (row.designNo || "").trim();
      if (!design) continue;
      const key = design.toUpperCase().replace(/[^A-Z0-9.]/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      inputs.push({
        demandId: demand.id,
        demandNo: demand.demandNo,
        demandDate: demand.date,
        designNumber: design,
        issuedTo: demand.issuedTo,
        pdNo: demand.pdNo || "",
        issuedAt: demand.createdAt,
      });
    }

    const made = await openReceiptChases(inputs, by);
    // The optional heartbeat: one post per design, so a Grok routine can show
    // what is now being waited on.
    for (const chase of made) {
      await postReceiptEvent(buildPost(chase, "demand.issued"), { attempts: 1, timeoutMs: 4000 });
    }
  } catch {
    // A demand must save whether the chase list is reachable or not.
  }
}

// Called when jangad entries are added. Closes every chase those entries
// answer — one visit from the diamond team often covers several designs.
export async function finishReceiptChasesQuietly(rows: JangadRow[]): Promise<void> {
  try {
    if (!rows.length) return;
    const open = (await listReceiptChases()).filter(isOpen);
    for (const chase of open) {
      const hit = findJangadIssue(chase, rows);
      if (!hit) continue;
      const closed = await closeReceiptChase(
        chase.id, "done", "the jangad register",
        `Diamonds issued on the jangad for ${chase.designNumber}.`,
        refFor(hit)
      );
      if (closed) {
        await postReceiptEvent(buildPost(closed, "receipt.done"), {
          attempts: 1, timeoutMs: 4000,
        });
      }
    }
  } catch {
    // The register must save whether the chase list is reachable or not.
  }
}

// --- The worker --------------------------------------------------------------

export type TickOutcome = {
  id: string;
  demandNo: string;
  designNumber: string;
  did: "reminded" | "closed";
  reminderNumber?: number;
  note: string;
};

export type TickReport = {
  at: string;
  open: number;
  due: number;
  reminded: number;
  closed: number;
  outcomes: TickOutcome[];
};

// One pass: close what has turned up, remind what is overdue.
//
// Safe to run at any time and any number of times. Two overlapping runs can at
// worst send the same reminder number twice, which the idempotency key on the
// post lets the receiver drop.
export async function runReceiptTick(now = new Date()): Promise<TickReport> {
  const chases = (await listReceiptChases()).filter(isOpen);
  const due = chases.filter(
    (c) => c.status !== "paused" && Date.parse(c.nextReminderAt) <= now.getTime()
  );

  const report: TickReport = {
    at: now.toISOString(),
    open: chases.length,
    due: due.length,
    reminded: 0,
    closed: 0,
    outcomes: [],
  };
  if (!due.length) return report;

  // Read the register once for the whole pass — but re-read each chase as it
  // is handled, so anything closed while this ran is respected.
  const jangad = await listJangad();

  for (const stale of due) {
    const chase = await getReceiptChase(stale.id);
    if (!chase || !isOpen(chase)) continue;
    // Somebody may have pushed the due time out, or already reminded, between
    // the list being read and now.
    if (Date.parse(chase.nextReminderAt) > now.getTime()) continue;

    const hit = findJangadIssue(chase, jangad);
    if (hit) {
      const closed = await closeReceiptChase(
        chase.id, "done", "the jangad register",
        `Diamonds found on the jangad for ${chase.designNumber}.`,
        refFor(hit)
      );
      report.closed++;
      report.outcomes.push({
        id: chase.id, demandNo: chase.demandNo, designNumber: chase.designNumber,
        did: "closed", note: `On the jangad as ${refFor(hit)} — chase closed.`,
      });
      if (closed) {
        await postReceiptEvent(buildPost(closed, "receipt.done", { now }), {
          attempts: 2, timeoutMs: 6000,
        });
      }
      continue;
    }

    // Still nothing. Send reminder number n.
    const n = chase.reminderNumber + 1;
    const post = buildPost(chase, "receipt.reminder", { reminderNumber: n, now });
    const sent = await postReceiptEvent(post);
    await recordReminder(chase.id, n, post.messageText, resultNote(sent));
    report.reminded++;
    report.outcomes.push({
      id: chase.id, demandNo: chase.demandNo, designNumber: chase.designNumber,
      did: "reminded", reminderNumber: n, note: resultNote(sent),
    });
  }

  return report;
}

// "Send reminder now" — brings the row forward and runs the pass, so the
// button goes through exactly the code a due reminder does.
export async function remindNow(id: string, by: string): Promise<TickReport | null> {
  const moved = await bringForward(id, by);
  if (!moved) return null;
  return runReceiptTick(new Date());
}
