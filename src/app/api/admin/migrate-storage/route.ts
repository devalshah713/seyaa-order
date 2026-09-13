// The button behind the move from Vercel Blob to Cloudflare R2.
//
// GET  reports what is where, without touching anything.
// POST copies everything across.
//
// Admins only, and the work is small enough — nine documents of a few hundred
// kilobytes — to finish inside one request.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { compareStores, migrateToR2, migrationHint } from "@/lib/dbMigrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  try {
    return NextResponse.json({ hint: migrationHint(), documents: await compareStores() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the stores.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  // Replacing a document R2 already holds is the one thing here that can lose
  // work, so it has to be asked for by name rather than being the default.
  const body = (await req.json().catch(() => ({}))) as { overwrite?: unknown };
  const overwrite = body.overwrite === true;

  try {
    return NextResponse.json(await migrateToR2(overwrite));
  } catch (err) {
    const message = err instanceof Error ? err.message : "The copy could not start.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
