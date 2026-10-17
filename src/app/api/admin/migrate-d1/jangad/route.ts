// The button behind moving the jangad register into the Cloudflare database.
//
// GET  counts the entries in the R2 file and in the database, side by side,
//      without changing anything.
// POST copies the entries across, skipping anything already there.
//
// The memo version of this sits one folder up. They are deliberately two
// buttons: the register and the memo book move when the owner is ready for
// each, in either order.
//
// Admins only. Neither one writes to R2 and neither one deletes anything, and
// both are safe to press twice.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { checkJangadStores, copyJangadToSql, sqlMigrationHint } from "@/lib/sqlMigrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  try {
    return NextResponse.json(await checkJangadStores());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the stores.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  // There is deliberately no overwrite here. An entry already in the database
  // may have been filled in there since, and putting the R2 copy back over it
  // would undo that.
  try {
    return NextResponse.json(await copyJangadToSql());
  } catch (err) {
    const message = err instanceof Error ? err.message : "The copy could not start.";
    return NextResponse.json({ error: message, hint: sqlMigrationHint() }, { status: 500 });
  }
}
