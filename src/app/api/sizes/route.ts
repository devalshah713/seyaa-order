import { NextRequest, NextResponse } from "next/server";
import { getCustomSizes, addCustomSize } from "@/lib/customSizesStore";
import { SHAPE_OPTIONS } from "@/lib/formConfig";

export const dynamic = "force-dynamic";

// Returns the custom (staff-added) sizes, keyed by shape.
export async function GET() {
  const sizes = await getCustomSizes();
  return NextResponse.json({ sizes });
}

// Adds a new custom size for a shape and persists it.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const shape = String(body.shape || "").trim();
  const size = String(body.size || "").trim();

  if (!shape || !SHAPE_OPTIONS.includes(shape)) {
    return NextResponse.json({ error: "Invalid diamond shape" }, { status: 400 });
  }
  if (!size) return NextResponse.json({ error: "Size is required" }, { status: 400 });
  if (size.length > 80) return NextResponse.json({ error: "Size label is too long" }, { status: 400 });

  try {
    const sizes = await addCustomSize(shape, size);
    return NextResponse.json({ sizes });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save size" },
      { status: 500 }
    );
  }
}
