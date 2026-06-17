import { PrismaClient } from "@prisma/client";
import { runSeed } from "../src/lib/seedData";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding reference data...");
  const result = await runSeed(prisma);
  console.log("Seed complete:", result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
