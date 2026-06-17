// Talks to the Google Apps Script Web App bound to the user's Google Sheet.
// All calls happen server-side. The script is generic: we send it the column
// HEADERS plus fully-built rows (it fills Order Number / Date / Status), so
// future column changes need no script edits.
import {
  SHEET_HEADERS,
  PRODUCT_FIELD_NAMES,
  DIAMOND_FIELD_NAMES,
} from "./formConfig";

const WEBAPP_URL = process.env.SHEETS_WEBAPP_URL;
const TOKEN = process.env.SHEETS_TOKEN || "";

export function isStorageConfigured(): boolean {
  return !!WEBAPP_URL;
}

export type DiamondBlock = Record<string, string>; // keyed by DIAMOND_FIELD_NAMES
export type ProductInput = {
  productType: string;
  quantity: number;
  product: Record<string, string>; // keyed by PRODUCT_FIELD_NAMES
  diamonds: DiamondBlock[];
};
export type NewOrder = {
  orderNumber: string;
  region: string;
  customerName: string;
  manufacturer: string;
  notes: string;
  items: ProductInput[];
};

// Reconstructed order for display.
export type OrderItem = {
  itemNo: string;
  productType: string;
  quantity: string;
  product: Record<string, string>;
  diamonds: DiamondBlock[];
};
export type Order = {
  orderNumber: string;
  date: string;
  status: string;
  region: string;
  customerName: string;
  manufacturer: string;
  notes: string;
  items: OrderItem[];
};

async function call<T>(payload: Record<string, unknown>): Promise<T> {
  if (!WEBAPP_URL) throw new Error("STORAGE_NOT_CONFIGURED");
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: TOKEN, ...payload }),
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Sheet request failed (${res.status})`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Sheet request failed");
  return data as T;
}

// Google Sheets treats a cell value starting with = + - @ as a formula,
// which breaks values like the round sieve sizes ("+1-1.5 · 1.15 MM …").
// A leading apostrophe forces Sheets to store it as plain text (the
// apostrophe itself is not stored or shown).
function escapeCell(v: string): string {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

// Build one sheet row (array, in SHEET_HEADERS order) for a product line.
// Order Number is provided by the user; Date / Status are left blank for
// the script to fill.
function buildRow(
  order: NewOrder,
  item: ProductInput,
  itemNo: number,
  diamond: DiamondBlock | null
): string[] {
  const get = (header: string): string => {
    switch (header) {
      case "Order Number":
        return order.orderNumber;
      case "Date":
      case "Status":
        return "";
      case "Item No":
        return String(itemNo);
      case "Region":
        return order.region;
      case "Customer Name":
        return order.customerName;
      case "Manufacturer":
        return order.manufacturer;
      case "Product Type":
        return item.productType;
      case "Quantity":
        return String(item.quantity);
      case "Notes":
        return order.notes;
    }
    if (PRODUCT_FIELD_NAMES.includes(header)) return item.product[header] ?? "";
    if (DIAMOND_FIELD_NAMES.includes(header)) return diamond ? diamond[header] ?? "" : "";
    return "";
  };
  // Escape everything except the Order Number, so the user's typed number
  // round-trips unchanged for routing/lookup.
  return SHEET_HEADERS.map((h) => (h === "Order Number" ? get(h) : escapeCell(get(h))));
}

export async function appendOrder(order: NewOrder): Promise<string> {
  const rows: string[][] = [];
  order.items.forEach((item, i) => {
    const itemNo = i + 1;
    if (item.diamonds.length === 0) {
      rows.push(buildRow(order, item, itemNo, null));
    } else {
      for (const d of item.diamonds) rows.push(buildRow(order, item, itemNo, d));
    }
  });

  const data = await call<{ ok: true; orderNumber: string }>({
    action: "append",
    headers: SHEET_HEADERS,
    rows,
  });
  // Prefer the user-typed number; fall back to whatever the script assigned.
  return order.orderNumber || data.orderNumber;
}

// Convert raw arrays + headers into row objects.
function toObjects(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => {
      o[h] = r[i] == null ? "" : String(r[i]);
    });
    return o;
  });
}

function groupOrders(objs: Record<string, string>[]): Order[] {
  const byOrder = new Map<string, Order>();
  for (const r of objs) {
    const num = r["Order Number"];
    if (!num) continue;
    if (!byOrder.has(num)) {
      byOrder.set(num, {
        orderNumber: num,
        date: r["Date"] || "",
        status: r["Status"] || "NEW",
        region: r["Region"] || "",
        customerName: r["Customer Name"] || "",
        manufacturer: r["Manufacturer"] || "",
        notes: r["Notes"] || "",
        items: [],
      });
    }
    const order = byOrder.get(num)!;
    const itemNo = r["Item No"] || "1";
    let item = order.items.find((it) => it.itemNo === itemNo);
    if (!item) {
      const product: Record<string, string> = {};
      for (const f of PRODUCT_FIELD_NAMES) product[f] = r[f] || "";
      item = {
        itemNo,
        productType: r["Product Type"] || "",
        quantity: r["Quantity"] || "",
        product,
        diamonds: [],
      };
      order.items.push(item);
    }
    // A diamond block exists on this row if a shape is filled.
    if (r["Diamond Shape"]) {
      const block: DiamondBlock = {};
      for (const f of DIAMOND_FIELD_NAMES) block[f] = r[f] || "";
      item.diamonds.push(block);
    }
  }
  return Array.from(byOrder.values());
}

export async function listOrders(): Promise<Order[]> {
  const data = await call<{ ok: true; headers: string[]; rows: string[][] }>({ action: "list" });
  const objs = toObjects(data.headers || SHEET_HEADERS, data.rows || []);
  const orders = groupOrders(objs);
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
