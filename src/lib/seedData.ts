import { PrismaClient } from "@prisma/client";

// Reference data tuned for a jewellery business. Used by both the CLI
// seed (prisma/seed.ts) and the /api/setup route on the live site.
// All writes are idempotent (upsert / reset), so it is safe to re-run.

const regions = [
  { name: "USA", currency: "USD" },
  { name: "Dubai", currency: "AED" },
  { name: "Hong Kong", currency: "HKD" },
  { name: "India", currency: "INR" },
];

// Diamond Size options taken from the round-diamond sieve chart provided
// by the client (brand name ignored). Each label shows the diamond's
// diameter in mm with its approximate carat weight.
const diamondSizes = [
  "-0.80 mm (0.002 ct)",
  "0.80 - 0.90 mm (0.003 ct)",
  "0.90 - 1.00 mm (0.004 ct)",
  "1.00 - 1.10 mm (0.005 ct)",
  "1.10 - 1.15 mm (0.006 ct)",
  "1.15 - 1.20 mm (0.007 ct)",
  "1.20 - 1.25 mm (0.008 ct)",
  "1.25 - 1.30 mm (0.009 ct)",
  "1.30 - 1.35 mm (0.010 ct)",
  "1.35 - 1.40 mm (0.011 ct)",
  "1.40 - 1.45 mm (0.012 ct)",
  "1.45 - 1.50 mm (0.013 ct)",
  "1.50 - 1.55 mm (0.014 ct)",
  "1.55 - 1.60 mm (0.016 ct)",
  "1.60 - 1.70 mm (0.018 ct)",
  "1.70 - 1.80 mm (0.021 ct)",
  "1.80 - 1.90 mm (0.025 ct)",
  "1.90 - 2.00 mm (0.029 ct)",
  "2.00 - 2.10 mm (0.035 ct)",
  "2.10 - 2.20 mm (0.039 ct)",
  "2.20 - 2.30 mm (0.044 ct)",
  "2.30 - 2.40 mm (0.052 ct)",
  "2.40 - 2.50 mm (0.058 ct)",
  "2.50 - 2.60 mm (0.069 ct)",
  "2.60 - 2.70 mm (0.074 ct)",
  "2.70 - 2.80 mm (0.078 ct)",
  "2.80 - 2.90 mm (0.086 ct)",
  "2.90 - 3.00 mm (0.095 ct)",
  "3.00 - 3.10 mm (0.108 ct)",
  "3.10 - 3.20 mm (0.116 ct)",
  "3.20 - 3.30 mm (0.125 ct)",
  "3.30 - 3.40 mm (0.135 ct)",
  "3.40 - 3.50 mm (0.146 ct)",
  "3.50 - 3.60 mm (0.159 ct)",
  "3.60 - 3.70 mm (0.175 ct)",
  "3.80 mm (0.20 ct)",
  "4.1 mm (0.25 ct)",
  "4.5 mm (0.33 ct)",
  "4.8 mm (0.40 ct)",
  "5.2 mm (0.50 ct)",
  "5.8 mm (0.75 ct)",
  "6.5 mm (1.00 ct)",
];

// inputType: SELECT (dropdown) | MULTISELECT (pick several) | NUMBER | TEXT
const attributes: {
  name: string;
  inputType: "SELECT" | "MULTISELECT" | "NUMBER" | "TEXT";
  unit?: string;
  options?: string[];
}[] = [
  { name: "Gold Color", inputType: "SELECT", options: ["Yellow", "White", "Rose", "Two-Tone"] },
  {
    name: "Gold Karat",
    inputType: "SELECT",
    options: ["10K", "14K", "18K", "21K", "22K", "24K"],
  },
  { name: "Length", inputType: "NUMBER", unit: "mm" },
  {
    name: "Diamond Shape",
    inputType: "MULTISELECT",
    options: [
      "Round",
      "Princess",
      "Oval",
      "Emerald",
      "Pear",
      "Marquise",
      "Cushion",
      "Heart",
      "Radiant",
      "Asscher",
      "Baguette",
      "Trillion",
    ],
  },
  { name: "Diamond Size", inputType: "SELECT", options: diamondSizes },
  { name: "Number of Diamonds", inputType: "NUMBER" },
  {
    name: "Stone Type",
    inputType: "SELECT",
    options: ["CVD", "HPHT", "CZ", "Polki", "Color Gemstone", "Color CVD Diamond"],
  },
  { name: "Stone Color", inputType: "TEXT" },
  { name: "Certificate Number", inputType: "TEXT" },
  { name: "Metal Weight (Approx)", inputType: "NUMBER", unit: "g" },
];

// The same specification set applies to every product type for now.
const productAttributeNames: { name: string; required?: boolean }[] = [
  { name: "Gold Color", required: true },
  { name: "Gold Karat", required: true },
  { name: "Length" },
  { name: "Diamond Shape" },
  { name: "Diamond Size" },
  { name: "Number of Diamonds" },
  { name: "Stone Type" },
  { name: "Stone Color" },
  { name: "Certificate Number" },
  { name: "Metal Weight (Approx)" },
];

const productTypeNames = ["Ring", "Necklace", "Bracelet", "Earrings", "Pendant", "Chain"];

export async function runSeed(prisma: PrismaClient) {
  const regionByName: Record<string, string> = {};
  for (const r of regions) {
    const rec = await prisma.region.upsert({
      where: { name: r.name },
      update: { currency: r.currency },
      create: r,
    });
    regionByName[r.name] = rec.id;
  }

  const attrByName: Record<string, string> = {};
  for (const a of attributes) {
    const rec = await prisma.attribute.upsert({
      where: { name: a.name },
      update: { inputType: a.inputType, unit: a.unit ?? null },
      create: { name: a.name, inputType: a.inputType, unit: a.unit ?? null },
    });
    attrByName[a.name] = rec.id;

    await prisma.attributeOption.deleteMany({ where: { attributeId: rec.id } });
    if (a.options) {
      await prisma.attributeOption.createMany({
        data: a.options.map((value, i) => ({ attributeId: rec.id, value, sortOrder: i })),
      });
    }
  }

  for (const ptName of productTypeNames) {
    const rec = await prisma.productType.upsert({
      where: { name: ptName },
      update: {},
      create: { name: ptName },
    });
    await prisma.productAttribute.deleteMany({ where: { productTypeId: rec.id } });
    await prisma.productAttribute.createMany({
      data: productAttributeNames.map((at, i) => ({
        productTypeId: rec.id,
        attributeId: attrByName[at.name],
        required: at.required ?? false,
        sortOrder: i,
      })),
    });
  }

  await prisma.user.upsert({
    where: { email: "owner@seyaa.com" },
    update: {},
    create: {
      name: "Owner",
      email: "owner@seyaa.com",
      role: "admin",
      regionId: regionByName["India"],
    },
  });

  // One sample order so the app isn't empty on first run.
  const existing = await prisma.order.findFirst();
  let createdSample = false;
  if (!existing) {
    const customer = await prisma.customer.create({
      data: { name: "Aisha Rahman", regionId: regionByName["Dubai"] },
    });
    const ring = await prisma.productType.findUniqueOrThrow({ where: { name: "Ring" } });
    await prisma.order.create({
      data: {
        orderNumber: "ORD-0001",
        status: "CONFIRMED",
        notes: "Customer wants delivery before Eid.",
        customerId: customer.id,
        regionId: regionByName["Dubai"],
        items: {
          create: [
            {
              productTypeId: ring.id,
              quantity: 1,
              specs: {
                create: [
                  { attributeId: attrByName["Gold Color"], value: "Rose" },
                  { attributeId: attrByName["Gold Karat"], value: "18K" },
                  { attributeId: attrByName["Diamond Shape"], value: "Round, Oval" },
                  { attributeId: attrByName["Diamond Size"], value: "1.15 - 1.20 mm (0.007 ct)" },
                  { attributeId: attrByName["Number of Diamonds"], value: "24" },
                  { attributeId: attrByName["Stone Type"], value: "CVD" },
                  { attributeId: attrByName["Certificate Number"], value: "IGI-123456" },
                ],
              },
            },
          ],
        },
      },
    });
    createdSample = true;
  }

  return {
    regions: regions.length,
    attributes: attributes.length,
    productTypes: productTypeNames.length,
    createdSample,
  };
}
