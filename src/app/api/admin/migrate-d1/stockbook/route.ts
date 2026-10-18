// The button behind moving the stock book into the Cloudflare database.
//
// GET  counts the entries in the R2 file and in the database, side by side,
//      without changing anything.
// POST copies the entries across, skipping anything already there.
//
// The memo version of this sits two folders up, and the register, the PD sheets
// and the demands have one each beside this. They are deliberately five
// buttons: each book moves when the owner is ready for it, in any order.
//
// Admins only. Neither one writes to R2 and neither one deletes anything, and
// both are safe to press twice.
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/currentUser";
import { checkStockStores, copyStockToSql, sqlMigrationHint } from "@/lib/sqlMigrate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  try {
    return NextResponse.json(await checkStockStores());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the stores.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  // There is deliberately no overwrite here. An entry already in the database
  // may have been corrected there since, and putting the R2 copy back over it
  // would undo that.
  try {
    return NextResponse.json(await copyStockToSql());
  } catch (err) {
    const message = err instanceof Error ? err.message : "The copy could not start.";
    return NextResponse.json({ error: message, hint: sqlMigrationHint() }, { status: 500 });
  }
}
