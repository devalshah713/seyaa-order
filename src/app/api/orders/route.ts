import { NextRequest, NextResponse } from "next/server";
import { appendOrder, listOrders, getOrder, updateStatus, isStorageConfigured, logActivity, NewOrder, ProductInput } from "@/lib/sheetStore";
import { PRODUCT_FIELD_NAMES, DIAMOND_FIELD_NAMES, DIAMOND_FIELDS, ORDER_STATUSES } from "@/lib/formConfig";
import { getCurrentUser } from "@/lib/currentUser";

type IncomingItem = {
  productType: string;
  quantity: number;
  product: Record<string, string>;
  diamonds: Record<string, string>[];
};
type IncomingOrder = {
  orderNumber: string;
  subDesignNo?: string;
  date?: string;
  region: string;
  customerName: string;
  manufacturer?: string;
  notes?: string;
  photos?: string[];
  items: IncomingItem[];
};

export const dynamic = "force-dynamic";

// Two modes:
//  - no params: slim list of orders for the Diamond Issue "pick an order"
//    dropdown (Order Number doubles as the Design Number).
//  - ?id=<orderNumber>: the order's estimated diamond demand, so the Diamond
//    Issue form can pre-fill its lines (editable — actual received may differ).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  try {
    if (id) {
      const order = await getOrder(id);
      if (!order) return NextResponse.json({ order: null });
      const demandLines = [];
      for (const it of order.items) {
        const qty = parseInt(it.quantity, 10) || 1;
        for (const d of it.diamonds) {
          const perPiece = parseFloat(d["Number of Diamonds"]) || 0;
          const pcs = perPiece * qty;
          // Estimate carats from a size label like "… · 0.07 ct" × total pcs.
          const m = (d["Diamond Size"] || "").match(/([\d.]+)\s*ct/i);
          const perCt = m ? parseFloat(m[1]) : 0;
          const carats = perCt ? Math.round(perCt * pcs * 100) / 100 : 0;
          demandLines.push({
            product: it.productType || "",
            shape: d["Diamond Shape"] || "",
            size: d["Diamond Size"] || "",
            pcs: pcs ? String(pcs) : "",
            stoneType: d["Stone Type"] || "",
            certiNo: d["Certificate Number"] || "",
            carats: carats ? String(carats) : "",
          });
        }
      }
      return NextResponse.json({
        order: {
          orderNumber: order.orderNumber,
          subDesignNo: order.subDesignNo || "",
          manufacturer: order.manufacturer || "",
          demandLines,
        },
      });
    }
    const orders = await listOrders();
    return NextResponse.json({
      orders: orders.map((o) => ({
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        product: o.items.map((i) => i.productType).filter(Boolean)[0] || "",
      })),
    });
  } catch {
    return NextResponse.json({ orders: [], order: null });
  }
}

// Update an order's status. Order number comes in the body so it works
// regardless of any spaces/symbols in the number.
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const orderNumber = (body.orderNumber as string) || "";
  const status = body.status as string;

  if (!orderNumber) return NextResponse.json({ error: "Order number required" }, { status: 400 });
  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  try {
    await updateStatus(orderNumber, status);
    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Changed status",
        order: orderNumber,
        details: `to ${status}`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update status" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Storage is not connected yet. The Google Sheet still needs to be linked." },
      { status: 503 }
    );
  }

  let body: IncomingOrder;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.orderNumber?.trim())
    return NextResponse.json({ error: "Order number is required" }, { status: 400 });
  if (!body.region) return NextResponse.json({ error: "Region is required" }, { status: 400 });
  if (!body.customerName?.trim())
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  if (!body.items?.length)
    return NextResponse.json({ error: "Add at least one product" }, { status: 400 });

  const orderNumber = body.orderNumber.trim();

  // Reject duplicate order numbers so two orders never collide.
  try {
    const existing = await listOrders();
    if (existing.some((o) => o.orderNumber === orderNumber)) {
      return NextResponse.json(
        { error: `Order number "${orderNumber}" already exists. Please use a different one.` },
        { status: 409 }
      );
    }
  } catch {
    // If the lookup fails, continue — the append will still be attempted.
  }

  const items: ProductInput[] = [];
  for (const it of body.items) {
    if (!it.productType) return NextResponse.json({ error: "Choose a product type for every item" }, { status: 400 });

    const product: Record<string, string> = {};
    for (const name of PRODUCT_FIELD_NAMES) {
      const v = it.product?.[name];
      if (v != null && String(v) !== "") product[name] = String(v);
    }

    // Keep only diamond blocks that have a shape; require all their fields.
    const diamonds: Record<string, string>[] = [];
    for (const d of it.diamonds || []) {
      if (!d["Diamond Shape"]) continue;
      for (const f of DIAMOND_FIELDS) {
        if (f.required && !(d[f.name] && String(d[f.name]).trim())) {
          return NextResponse.json(
            { error: `"${f.name}" is required for each diamond shape (${d["Diamond Shape"]}).` },
            { status: 400 }
          );
        }
      }
      const block: Record<string, string> = {};
      for (const name of DIAMOND_FIELD_NAMES) block[name] = d[name] ? String(d[name]) : "";
      diamonds.push(block);
    }

    items.push({
      productType: it.productType,
      quantity: Number(it.quantity) || 1,
      product,
      diamonds,
    });
  }

  const order: NewOrder = {
    orderNumber,
    subDesignNo: (body.subDesignNo || "").trim(),
    date: (body.date || "").trim(),
    region: body.region,
    customerName: body.customerName.trim(),
    manufacturer: body.manufacturer || "",
    notes: body.notes || "",
    photos: Array.isArray(body.photos) ? body.photos.filter(Boolean) : [],
    items,
  };

  try {
    const orderNumber = await appendOrder(order);
    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Created order",
        order: orderNumber,
        details: `${order.customerName} · ${order.items.length} item(s)`,
      });
    }
    return NextResponse.json({ id: orderNumber, orderNumber });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save order" },
      { status: 500 }
    );
  }
}
