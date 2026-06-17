import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSeed } from "@/lib/seedData";

export const dynamic = "force-dynamic";

// One-time (idempotent) setup: loads the jewellery reference data
// (regions, attributes, product types) and a sample order into the live
// database. Safe to call more than once. If SETUP_TOKEN is set as an
// environment variable, it must be passed as ?token=... to run.
export async function GET(req: NextRequest) {
  const required = process.env.SETUP_TOKEN;
  if (required) {
    const token = req.nextUrl.searchParams.get("token");
    if (token !== required) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runSeed(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Setup failed" },
      { status: 500 }
    );
  }
}
