import { NextRequest, NextResponse } from "next/server";
import { appendOrder, isStorageConfigured, NewOrder, OrderItemInput } from "@/lib/sheetStore";
import { SPEC_FIELDS } from "@/lib/formConfig";

// The form posts ids that equal the names (see /api/meta), so:
//   regionId       = region name
//   productTypeId  = product type name
//   spec.attributeId = spec field name
type IncomingSpec = { attributeId: string; value: string };
type IncomingItem = {
  productTypeId: string;
  quantity: number;
  specs: IncomingSpec[];
};
type IncomingOrder = {
  customer: { name: string };
  regionId: string;
  notes?: string;
  items: IncomingItem[];
};

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

  if (!body.regionId) return NextResponse.json({ error: "Region is required" }, { status: 400 });
  if (!body.customer?.name?.trim())
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  if (!body.items?.length)
    return NextResponse.json({ error: "Add at least one product" }, { status: 400 });

  const validSpecNames = new Set(SPEC_FIELDS.map((f) => f.name));

  const items: OrderItemInput[] = body.items.map((it) => {
    const item: OrderItemInput = {
      "Product Type": it.productTypeId,
      Quantity: it.quantity || 1,
    };
    for (const s of it.specs) {
      if (validSpecNames.has(s.attributeId) && s.value !== "" && s.value != null) {
        item[s.attributeId] = String(s.value);
      }
    }
    return item;
  });

  const order: NewOrder = {
    region: body.regionId,
    customerName: body.customer.name.trim(),
    notes: body.notes || "",
    items,
  };

  try {
    const orderNumber = await appendOrder(order);
    return NextResponse.json({ id: orderNumber, orderNumber });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save order" },
      { status: 500 }
    );
  }
}
