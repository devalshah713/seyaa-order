// Talks to the Google Apps Script Web App that is bound to the user's
// Google Sheet. All calls happen server-side (API routes / server
// components), so there are no CORS concerns.
//
// Configuration (set in Vercel → Settings → Environment Variables):
//   SHEETS_WEBAPP_URL  - the Apps Script Web App URL (…/exec)
//   SHEETS_TOKEN       - a shared secret matching the token in the script
import { SPEC_FIELDS } from "./formConfig";

const WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;
const TOKEN = process.env.SHEETS_TOKEN || "";

export function isStorageConfigured(): boolean {
  return !!WEBAPP_URL;
}

// One product line within an order, keyed by the field display names.
export type OrderItemInput = {
  "Product Type": string;
  Quantity: number;
} & Record<string, string | number>;

export type NewOrder = {
  region: string;
  customerName: string;
  notes: string;
  items: OrderItemInput[];
};

// A row read back from the Sheet, keyed by column header.
export type SheetRow = Record<string, string>;

// An order reconstructed from one or more sheet rows sharing an order number.
export type Order = {
  orderNumber: string;
  date: string;
  status: string;
  region: string;
  customerName: string;
  notes: string;
  items: SheetRow[];
};

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  if (!WEBAPP_URL) throw new Error("STORAGE_NOT_CONFIGURED");
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: TOKEN, ...payload }),
    // Always fetch fresh data from the sheet.
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Sheet request failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Sheet request failed");
  return data as T;
}

// Create a new order (one sheet row per product). The Apps Script assigns
// the sequential order number and timestamp, and returns the order number.
export async function appendOrder(order: NewOrder): Promise<string> {
  const data = await call<{ ok: true; orderNumber: string }>({
    action: "append",
    order,
    specFields: SPEC_FIELDS.map((f) => f.name),
  });
  return data.orderNumber;
}

function groupRows(rows: SheetRow[]): Order[] {
  const byNumber = new Map<string, Order>();
  // Preserve sheet order but list newest first afterwards.
  for (const r of rows) {
    const num = r["Order Number"];
    if (!num) continue;
    if (!byNumber.has(num)) {
      byNumber.set(num, {
        orderNumber: num,
        date: r["Date"] || "",
        status: r["Status"] || "NEW",
        region: r["Region"] || "",
        customerName: r["Customer Name"] || "",
        notes: r["Notes"] || "",
        items: [],
      });
    }
    byNumber.get(num)!.items.push(r);
  }
  return Array.from(byNumber.values());
}

export async function listOrders(): Promise<Order[]> {
  const data = await call<{ ok: true; rows: SheetRow[] }>({ action: "list" });
  const orders = groupRows(data.rows || []);
  // Newest first (order numbers increase over time).
  orders.sort((a, b) => b.orderNumber.localeCompare(a.orderNumber));
  return orders;
}

export async function getOrder(orderNumber: string): Promise<Order | null> {
  const all = await listOrders();
  return all.find((o) => o.orderNumber === orderNumber) || null;
}

export async function updateStatus(orderNumber: string, status: string): Promise<void> {
  await call({ action: "updateStatus", orderNumber, status });
}
