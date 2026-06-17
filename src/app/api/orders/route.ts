import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type IncomingSpec = { attributeId: string; value: string };
type IncomingItem = {
  productTypeId: string;
  quantity: number;
  price?: number | null;
  specs: IncomingSpec[];
};
type IncomingOrder = {
  customer: { id?: string; name: string; phone?: string; email?: string };
  regionId: string;
  salesPerson?: string;
  notes?: string;
  items: IncomingItem[];
};

// Generates the next sequential order number, e.g. ORD-0007.
async function nextOrderNumber(): Promise<string> {
  const last = await prisma.order.findFirst({
    orderBy: { createdAt: "desc" },
    select: { orderNumber: true },
  });
  let n = 1;
  if (last?.orderNumber) {
    const m = last.orderNumber.match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `ORD-${String(n).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  let body: IncomingOrder;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.regionId) {
    return NextResponse.json({ error: "Region is required" }, { status: 400 });
  }
  if (!body.customer?.name?.trim()) {
    return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
  }
  if (!body.items?.length) {
    return NextResponse.json({ error: "Add at least one product" }, { status: 400 });
  }

  // Reuse existing customer if an id was given, else create one.
  let customerId = body.customer.id;
  if (!customerId) {
    const c = await prisma.customer.create({
      data: {
        name: body.customer.name.trim(),
        phone: body.customer.phone || null,
        email: body.customer.email || null,
        regionId: body.regionId,
      },
    });
    customerId = c.id;
  }

  const orderNumber = await nextOrderNumber();

  const order = await prisma.order.create({
    data: {
      orderNumber,
      regionId: body.regionId,
      customerId,
      salesPerson: body.salesPerson || null,
      notes: body.notes || null,
      items: {
        create: body.items.map((it) => ({
          productTypeId: it.productTypeId,
          quantity: it.quantity || 1,
          price: it.price ?? null,
          specs: {
            create: it.specs
              .filter((s) => s.value !== "" && s.value != null)
              .map((s) => ({ attributeId: s.attributeId, value: String(s.value) })),
          },
        })),
      },
    },
  });

  return NextResponse.json({ id: order.id, orderNumber: order.orderNumber });
}
