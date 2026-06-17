import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ---- Reference data tuned for a jewellery business ----

const regions = [
  { name: "USA", currency: "USD" },
  { name: "Dubai", currency: "AED" },
  { name: "Hong Kong", currency: "HKD" },
  { name: "India", currency: "INR" },
];

// inputType: SELECT (dropdown) | NUMBER | TEXT
const attributes: {
  name: string;
  inputType: "SELECT" | "NUMBER" | "TEXT";
  unit?: string;
  options?: string[];
}[] = [
  {
    name: "Gold Color",
    inputType: "SELECT",
    options: ["Yellow", "White", "Rose", "Two-Tone"],
  },
  {
    name: "Gold Clarity (Karat)",
    inputType: "SELECT",
    options: ["10K", "14K", "18K", "21K", "22K", "24K"],
  },
  { name: "Metal Weight", inputType: "NUMBER", unit: "g" },
  {
    name: "Diamond Size",
    inputType: "NUMBER",
    unit: "ct",
  },
  {
    name: "Diamond Clarity",
    inputType: "SELECT",
    options: ["FL", "IF", "VVS1", "VVS2", "VS1", "VS2", "SI1", "SI2", "I1"],
  },
  {
    name: "Diamond Color",
    inputType: "SELECT",
    options: ["D", "E", "F", "G", "H", "I", "J", "K"],
  },
  {
    name: "Diamond Cut",
    inputType: "SELECT",
    options: ["Round", "Princess", "Oval", "Emerald", "Pear", "Marquise", "Cushion", "Heart"],
  },
  { name: "Number of Diamonds", inputType: "NUMBER" },
  { name: "Ring Size", inputType: "TEXT" },
  { name: "Length", inputType: "NUMBER", unit: "in" },
  { name: "Engraving", inputType: "TEXT" },
];

// Which attributes apply to each product type, and whether required.
const productTypes: {
  name: string;
  attrs: { name: string; required?: boolean }[];
}[] = [
  {
    name: "Ring",
    attrs: [
      { name: "Gold Color", required: true },
      { name: "Gold Clarity (Karat)", required: true },
      { name: "Ring Size", required: true },
      { name: "Diamond Size" },
      { name: "Diamond Clarity" },
      { name: "Diamond Color" },
      { name: "Diamond Cut" },
      { name: "Number of Diamonds" },
      { name: "Metal Weight" },
      { name: "Engraving" },
    ],
  },
  {
    name: "Necklace",
    attrs: [
      { name: "Gold Color", required: true },
      { name: "Gold Clarity (Karat)", required: true },
      { name: "Length", required: true },
      { name: "Diamond Size" },
      { name: "Diamond Clarity" },
      { name: "Diamond Color" },
      { name: "Number of Diamonds" },
      { name: "Metal Weight" },
    ],
  },
  {
    name: "Bracelet",
    attrs: [
      { name: "Gold Color", required: true },
      { name: "Gold Clarity (Karat)", required: true },
      { name: "Length" },
      { name: "Diamond Size" },
      { name: "Diamond Clarity" },
      { name: "Number of Diamonds" },
      { name: "Metal Weight" },
    ],
  },
  {
    name: "Earrings",
    attrs: [
      { name: "Gold Color", required: true },
      { name: "Gold Clarity (Karat)", required: true },
      { name: "Diamond Size" },
      { name: "Diamond Clarity" },
      { name: "Diamond Color" },
      { name: "Diamond Cut" },
      { name: "Number of Diamonds" },
      { name: "Metal Weight" },
    ],
  },
  {
    name: "Pendant",
    attrs: [
      { name: "Gold Color", required: true },
      { name: "Gold Clarity (Karat)", required: true },
      { name: "Diamond Size" },
      { name: "Diamond Clarity" },
      { name: "Diamond Cut" },
      { name: "Engraving" },
      { name: "Metal Weight" },
    ],
  },
  {
    name: "Chain",
    attrs: [
      { name: "Gold Color", required: true },
      { name: "Gold Clarity (Karat)", required: true },
      { name: "Length", required: true },
      { name: "Metal Weight" },
    ],
  },
];

async function main() {
  console.log("Seeding reference data...");

  // Regions
  const regionByName: Record<string, string> = {};
  for (const r of regions) {
    const rec = await prisma.region.upsert({
      where: { name: r.name },
      update: { currency: r.currency },
      create: r,
    });
    regionByName[r.name] = rec.id;
  }

  // Attributes + options
  const attrByName: Record<string, string> = {};
  for (const a of attributes) {
    const rec = await prisma.attribute.upsert({
      where: { name: a.name },
      update: { inputType: a.inputType, unit: a.unit ?? null },
      create: { name: a.name, inputType: a.inputType, unit: a.unit ?? null },
    });
    attrByName[a.name] = rec.id;

    // reset options for idempotency
    await prisma.attributeOption.deleteMany({ where: { attributeId: rec.id } });
    if (a.options) {
      await prisma.attributeOption.createMany({
        data: a.options.map((value, i) => ({
          attributeId: rec.id,
          value,
          sortOrder: i,
        })),
      });
    }
  }

  // Product types + links
  for (const pt of productTypes) {
    const rec = await prisma.productType.upsert({
      where: { name: pt.name },
      update: {},
      create: { name: pt.name },
    });
    await prisma.productAttribute.deleteMany({ where: { productTypeId: rec.id } });
    await prisma.productAttribute.createMany({
      data: pt.attrs.map((at, i) => ({
        productTypeId: rec.id,
        attributeId: attrByName[at.name],
        required: at.required ?? false,
        sortOrder: i,
      })),
    });
  }

  // A couple of demo users
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

  // A sample customer + order so the app isn't empty on first run
  const existing = await prisma.order.findFirst();
  if (!existing) {
    const customer = await prisma.customer.create({
      data: {
        name: "Aisha Rahman",
        phone: "+971 50 123 4567",
        email: "aisha@example.com",
        regionId: regionByName["Dubai"],
      },
    });
    await prisma.order.create({
      data: {
        orderNumber: "ORD-0001",
        status: "CONFIRMED",
        salesPerson: "Imran (Dubai showroom)",
        notes: "Customer wants delivery before Eid.",
        customerId: customer.id,
        regionId: regionByName["Dubai"],
        items: {
          create: [
            {
              productTypeId: (await prisma.productType.findUniqueOrThrow({
                where: { name: "Ring" },
              })).id,
              quantity: 1,
              price: 4500,
              specs: {
                create: [
                  { attributeId: attrByName["Gold Color"], value: "Rose" },
                  { attributeId: attrByName["Gold Clarity (Karat)"], value: "18K" },
                  { attributeId: attrByName["Ring Size"], value: "US 6.5" },
                  { attributeId: attrByName["Diamond Size"], value: "1.50" },
                  { attributeId: attrByName["Diamond Clarity"], value: "VVS1" },
                  { attributeId: attrByName["Diamond Color"], value: "F" },
                  { attributeId: attrByName["Diamond Cut"], value: "Oval" },
                ],
              },
            },
          ],
        },
      },
    });
    console.log("Created sample order ORD-0001");
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
