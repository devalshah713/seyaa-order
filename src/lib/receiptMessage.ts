// The words of a receipt chase: the block of text a chase event turns into.
//
// Nothing here sends anything anywhere. The text is written out, stored on the
// chase row and shown on the screen with a Copy text button, because what
// happens next is a person copying it into the "Diamond bagging group
// internal" WhatsApp group by hand. That hand-off is the part that works, so
// it is the part that is kept.
//
// Three events, all written the same way:
//   demand.issued    a demand went to the diamond team and is now being watched
//   receipt.reminder nothing on the jangad yet — this is reminder number n
//   receipt.done     a jangad issue entry exists, the chase is closed
import "server-only";
import { elapsedWords, istDate } from "./chaseTime";
import type { ReceiptChase } from "./receiptChase";

export type ReceiptEventName = "demand.issued" | "receipt.reminder" | "receipt.done";

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
