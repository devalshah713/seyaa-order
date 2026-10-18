// The worker behind the receipt chase, and the two hooks that feed it.
//
// Everything that decides whether to ping anybody lives here, in one place, so
// there is only ever one answer to "have these diamonds turned up yet?" — and
// it is asked against the live register every single time, immediately before
// a reminder goes out. A chase answered in the seconds between the row falling
// due and the worker reaching it sends nothing.
import "server-only";
import { joinDesignNo, sameDesignOrPiece } from "./designNo";
import { inWorkingHours } from "./chaseTime";
import { stageStarted } from "./jangadConfig";
import type { JangadRow } from "./jangadConfig";
import { listJangad } from "./jangadStore";
import type { Demand } from "./demandStore";
import {
  applyClose, applyReminder, bringForward, bringForwardMany, closeReceiptChase,
  isOpen, listReceiptChases, mutateReceiptChases, openReceiptChases,
  type NewReceiptChase,
} from "./receiptChaseStore";
import type { ReceiptChase } from "./receiptChase";
import { buildMessageText } from "./receiptMessage";

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

// How the register entry is named in the log and on the chase row.
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

    await openReceiptChases(inputs, by);
  } catch {
    // A demand must save whether the chase list is reachable or not.
  }
}

// Called when jangad entries are added. Closes every chase those entries
// answer — one visit from the diamond team often covers several designs.
export async function finishReceiptChasesQuietly(rows: JangadRow[]): Promise<void> {
  try {
    if (!rows.length) return;

    // One pass, whatever the visit covered.
    //
    // This used to read and write the whole chase book once per design closed,
    // and the diamond team rarely brings back one design at a time. Six closed
    // in a press measured between 49 and 237 milliseconds depending on how much
    // history the chases carried, against the ten a request is allowed.
    //
    // Running out there was worse than a slow save. The register rows have
    // already been written by the time this is reached, so the Worker was being
    // killed after the issue was safely recorded. Staff saw a failure, believed
    // nothing had saved, and issued the same diamonds again, which is how a
    // visit ends up in the register twice.
    const at = new Date();
    await mutateReceiptChases((db) => {
      for (const chase of db.chases) {
        if (!isOpen(chase)) continue;
        const hit = findJangadIssue(chase, rows);
        if (!hit) continue;
        applyClose(
          chase, "done", "the jangad register",
          `Diamonds issued on the jangad for ${chase.designNumber}.`,
          refFor(hit), at
        );
      }
    });
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
  // Overdue, but the office is shut: held back rather than sent.
  deferred: number;
  outcomes: TickOutcome[];
};

// One pass: close what has turned up, remind what is overdue.
//
// Safe to run at any time and any number of times. Two overlapping runs can at
// worst record the same reminder number twice.
//
// The whole pass is one read and one write of the chase document, however many
// designs it covers. The morning run has well over a hundred overdue, and
// touching the document once per design would spend the ten milliseconds of
// processor time the free Worker plan allows long before it reached the end.
export async function runReceiptTick(
  now = new Date(),
  opts: { force?: boolean } = {}
): Promise<TickReport> {
  // Quiet hours are enforced here as well as when the next reminder is timed.
  // Timing alone only holds while every run happens inside the window, and a
  // schedule is one edit away from not doing that — the rule that nobody is
  // pinged on a Sunday should not rest on the crontab being right.
  //
  // A person pressing "Run the checks now" is the deliberate exception: they
  // are asking for it, and they can see what they are asking for.
  const quiet = !opts.force && !inWorkingHours(now);

  // The register is a different document, so it is read once here, before the
  // chase document is opened. Nothing inside the pass below waits on the
  // network: every moment spent in there is a moment somebody else's save
  // could be changing the chase document underneath it.
  const jangad = await listJangad();

  return mutateReceiptChases((db) => {
    const chases = db.chases.filter(isOpen);
    const due = chases.filter(
      (c) => c.status !== "paused" && Date.parse(c.nextReminderAt) <= now.getTime()
    );

    const report: TickReport = {
      at: now.toISOString(),
      open: chases.length,
      due: due.length,
      reminded: 0,
      closed: 0,
      deferred: 0,
      outcomes: [],
    };
    if (!due.length) return report;

    // One stamp for the whole pass. It is also the truth: these reminders all
    // went out together, in one run.
    const stamp = new Date();

    for (const chase of due) {
      // The due list is built from this same document, so nothing outside this
      // request can close a chase while the pass runs. The only thing that
      // could is the pass itself, and a chase appears in the due list once, so
      // one that was closed a moment ago is never also reminded. The check
      // stays because that is the rule being relied on, not an accident.
      if (!isOpen(chase)) continue;

      const hit = findJangadIssue(chase, jangad);
      if (hit) {
        applyClose(
          chase, "done", "the jangad register",
          `Diamonds found on the jangad for ${chase.designNumber}.`,
          refFor(hit), stamp
        );
        report.closed++;
        report.outcomes.push({
          id: chase.id, demandNo: chase.demandNo, designNumber: chase.designNumber,
          did: "closed", note: `On the jangad as ${refFor(hit)} — chase closed.`,
        });
        continue;
      }

      // Still nothing — but the office is shut, so it waits for the next run
      // rather than going out at midnight or on a Sunday. Nothing is recorded,
      // so it is still due when the window opens and keeps its number.
      if (quiet) {
        report.deferred++;
        continue;
      }

      // Reminder number n: write the text down and set the next due time.
      const n = chase.reminderNumber + 1;
      const messageText = buildMessageText(chase, "receipt.reminder", now, n);
      applyReminder(chase, n, messageText, stamp);
      report.reminded++;
      report.outcomes.push({
        id: chase.id, demandNo: chase.demandNo, designNumber: chase.designNumber,
        did: "reminded", reminderNumber: n,
        note: `Reminder ${n} recorded. Copy the text from the row into the WhatsApp group.`,
      });
    }

    return report;
  });
}

// "Send reminder now" — brings the row forward and runs the pass, so the
// button goes through exactly the code a due reminder does.
export async function remindNow(id: string, by: string): Promise<TickReport | null> {
  const moved = await bringForward(id, by);
  if (!moved) return null;
  return runReceiptTick(new Date(), { force: true });
}

// "Remind selected" — the same thing for a tickful of designs.
//
// One pass covers the whole batch: runReceiptTick already walks every chase
// that has come due, and after the batch bring-forward all of them have. So the
// tick runs once, not once per design, and the processor time of reminding
// fifty rows is barely more than the time of reminding one.
export async function remindMany(
  ids: string[],
  by: string
): Promise<{ moved: string[]; report: TickReport | null }> {
  const moved = await bringForwardMany(ids, by);
  // Everything asked for was already closed, so there is nothing a pass could
  // find and no reason to spend a read of the register on it.
  if (!moved.length) return { moved: [], report: null };
  return { moved, report: await runReceiptTick(new Date(), { force: true }) };
}
