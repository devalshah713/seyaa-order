// What a diamond receipt chase is, apart from where it is kept.
//
// The shape lives here rather than in the store because the chase screen runs
// in the browser and the store is "server-only" — a client component that
// imported the store to learn which statuses count as open would drag the Blob
// client in with it. Nothing here touches storage or Node.

// "watching"  — the demand has gone to the diamond team; the first day is
//               still running and nobody has been chased
// "reminding" — a day has passed with no bags on the jangad, and reminders
//               are going out every six hours
// "paused"    — chased MAX_REMINDERS times with nothing to show for it; it
//               waits for a person rather than pinging for ever
// "done"      — a jangad issue entry exists, the diamonds are accounted for
// "cancelled" — closed by hand; this demand is not going to be received
export type ReceiptChaseStatus =
  | "watching" | "reminding" | "paused" | "done" | "cancelled";

export const OPEN_STATUSES: ReceiptChaseStatus[] = ["watching", "reminding", "paused"];

export function isOpenStatus(s: string): boolean {
  return (OPEN_STATUSES as string[]).includes(s);
}

export type ReceiptChaseEvent = {
  at: string; // ISO
  kind: "opened" | "reminder" | "done" | "cancelled" | "paused" | "resumed";
  n?: number; // which reminder, for kind "reminder"
  note: string;
  by?: string; // username, or "" when the worker did it
};

export type ReceiptChase = {
  // One chase per design number on a demand — a demand covering four designs
  // is four things to wait for, and three of them arriving is not all of them.
  id: string; // "<demandId>::<flattened design number>"
  demandId: string; // "DD-26-27-183"
  demandNo: string; // "DD/26-27/183"
  demandDate: string; // yyyy-mm-dd, as written on the demand
  designNumber: string;
  issuedTo: string; // the diamond team this went to
  pdNo: string;

  // When it went to the diamond team, which is what the whole clock hangs on.
  issuedAt: string; // ISO

  status: ReceiptChaseStatus;
  reminderNumber: number; // how many have gone out
  nextReminderAt: string; // ISO
  lastRemindedAt?: string;
  // The last block of text built for Deval to forward. Kept so the screen can
  // offer it for copying long after the ping itself has gone.
  lastMessageText?: string;

  completedAt?: string;
  closedBy?: string; // a username, or "the jangad register" when it closed itself
  jangadRef?: string; // the register entry that closed it

  events: ReceiptChaseEvent[];
  createdAt: string;
  updatedAt: string;
};

export const isOpen = (c: ReceiptChase) => isOpenStatus(c.status);

export const STATUS_LABEL: Record<ReceiptChaseStatus, string> = {
  watching: "Waiting",
  reminding: "Chasing",
  paused: "Paused",
  done: "Received",
  cancelled: "Cancelled",
};

// The id is built from the two things that identify a chase, with the design
// number flattened so "SN/BR/1" and "SN-BR-1" cannot become two chases for the
// same work.
export function chaseId(demandId: string, designNumber: string): string {
  return `${demandId}::${designNumber.toUpperCase().replace(/[^A-Z0-9.]/g, "")}`;
}
