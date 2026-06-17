import { NextRequest, NextResponse } from "next/server";
import { updateStatus } from "@/lib/sheetStore";
import { ORDER_STATUSES } from "@/lib/formConfig";

// Update an order's status (used by the dropdown on the order detail page).
// `id` is the order number (e.g. ORD-0001).
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json().catch(() => ({}));
  const status = body.status as string;

  if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  try {
    await updateStatus(decodeURIComponent(params.id), status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to update status" },
      { status: 500 }
    );
  }
}
