import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Everything the New Order form needs: regions and product types with
// their applicable attributes (and dropdown options).
export async function GET() {
  const [regions, productTypes] = await Promise.all([
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    prisma.productType.findMany({
      orderBy: { name: "asc" },
      include: {
        attributes: {
          orderBy: { sortOrder: "asc" },
          include: {
            attribute: {
              include: {
                options: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
        },
      },
    }),
  ]);

  // Reshape into a form-friendly structure.
  const shaped = productTypes.map((pt) => ({
    id: pt.id,
    name: pt.name,
    attributes: pt.attributes.map((pa) => ({
      id: pa.attribute.id,
      name: pa.attribute.name,
      inputType: pa.attribute.inputType,
      unit: pa.attribute.unit,
      required: pa.required,
      options: pa.attribute.options.map((o) => o.value),
    })),
  }));

  return NextResponse.json({ regions, productTypes: shaped });
}
