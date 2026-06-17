import { NextResponse } from "next/server";
import { REGIONS, PRODUCT_TYPES, SPEC_FIELDS } from "@/lib/formConfig";

export const dynamic = "force-dynamic";

// Everything the New Order form needs. Now sourced from the code config
// (formConfig.ts) rather than the database. Every product type shares the
// same specification fields. Ids are the names themselves (names are
// unique), which keeps the form ↔ sheet mapping simple.
export async function GET() {
  const attributes = SPEC_FIELDS.map((f) => ({
    id: f.name,
    name: f.name,
    inputType: f.inputType,
    unit: f.unit ?? null,
    required: !!f.required,
    options: f.options ?? [],
  }));

  const productTypes = PRODUCT_TYPES.map((name) => ({
    id: name,
    name,
    attributes,
  }));

  const regions = REGIONS.map((r) => ({ id: r.name, name: r.name, currency: r.currency }));

  return NextResponse.json({ regions, productTypes });
}
