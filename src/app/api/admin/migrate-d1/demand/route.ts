// The button behind moving the diamond demands into the Cloudflare database.
//
// GET  counts the demands in the R2 file and in the database, side by side,
//      without changing anything.
// POST copies the demands across, skipping anything already there.
//
// The memo version of this sits two folders up, and the register and the PD
// sheets have one each beside this. Four buttons, four decisions, any order.
//
// The receipt chase is not part of this. It keeps its own R2 file and goes on
// being read and written there whichever store the demands are in.
//
// Admins only. Neither one writes to R2 and neither one deletes anything, and
// both are safe to press twice.
import { NextResponse } from "next/server";
import { checkDemandStores, copyDemandsToSql, sqlMigrationHint } from "@/lib/sqlMigrate";
import { requireAdmin } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  try {
    return NextResponse.json(await checkDemandStores());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read the stores.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(): Promise<NextResponse> {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admins only." }, { status: 403 });

  // There is deliberately no overwrite here. A demand already in the database
  // may have been corrected there since, and putting the R2 copy back over it
  // would undo that.
  try {
    return NextResponse.json(await copyDemandsToSql());
  } catch (err) {
    const message = err instanceof Error ? err.message : "The copy could not start.";
    return NextResponse.json({ error: message, hint: sqlMigrationHint() }, { status: 500 });
  }
}
