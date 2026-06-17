import { NextRequest, NextResponse } from "next/server";
import { appendOrder, isStorageConfigured, NewOrder, ProductInput } from "@/lib/sheetStore";
import { PRODUCT_FIELD_NAMES, DIAMOND_FIELD_NAMES, DIAMOND_FIELDS } from "@/lib/formConfig";

type IncomingItem = {
  productType: string;
  quantity: number;
  product: Record<string, string>;
  diamonds: Record<string, string>[];
};
type IncomingOrder = {
  region: string;
  customerName: string;
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

  if (!body.region) return NextResponse.json({ error: "Region is required" }, { status: 400 });
  if (!body.customerName?.trim())
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  if (!body.items?.length)
    return NextResponse.json({ error: "Add at least one product" }, { status: 400 });

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
    region: body.region,
    customerName: body.customerName.trim(),
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
