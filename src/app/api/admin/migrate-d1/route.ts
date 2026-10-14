// The button behind moving the memo records into the Cloudflare database.
//
// GET  counts what is in the R2 files and what is in the database, side by
//      side, without changing anything.
// POST copies the records across, skipping anything already there.
//
// Admins only. Neither one writes to R2 and neither one deletes anything, and
// both are safe to press twice.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { checkMemoStores, copyMemosToSql, sqlMigrationHint } from "@/lib/sqlMigrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  try {
    return NextResponse.json(await checkMemoStores());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the stores.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  // There is deliberately no overwrite here, unlike the R2 copy. A record
  // already in the database may have been changed in the database since, and
  // putting the R2 copy back over it would undo that.
  try {
    return NextResponse.json(await copyMemosToSql());
  } catch (err) {
    const message = err instanceof Error ? err.message : "The copy could not start.";
    return NextResponse.json({ error: message, hint: sqlMigrationHint() }, { status: 500 });
  }
}
