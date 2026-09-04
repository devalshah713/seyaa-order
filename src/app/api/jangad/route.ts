import { NextRequest, NextResponse } from "next/server";
import {
  addJangadRows, listJangad, normalizeJangadRow, seedFromDesign, updateJangadRows,
} from "@/lib/jangadStore";
import { finishReceiptChasesQuietly } from "@/lib/receiptChaseRun";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    // ?design=<design or piece number> returns everything the register would
    // otherwise be copied out of the PD sheet by hand. Nothing is saved.
    const design = req.nextUrl.searchParams.get("design");
    if (design !== null) {
      const seed = await seedFromDesign(design);
      if (!seed) {
        return NextResponse.json(
          { error: `No PD sheet found for “${design}”.` },
          { status: 404 }
        );
      }
      return NextResponse.json({ seed });
    }
    return NextResponse.json({ rows: await listJangad() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the register." },
      { status: 503 }
    );
  }
}

// POST adds a batch of rows; PATCH saves edits to a screenful of existing ones.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const incoming = Array.isArray(body.rows) ? body.rows : [];
  const rows = incoming.map(normalizeJangadRow);
  if (!rows.length) {
    return NextResponse.json({ error: "Nothing to add." }, { status: 400 });
  }

  try {
    const added = await addJangadRows(rows, {
      pdId: typeof body.pdId === "string" ? body.pdId : undefined,
      pdNo: typeof body.pdNo === "string" ? body.pdNo : undefined,
      demandNo: typeof body.demandNo === "string" ? body.demandNo : undefined,
      // The issue screen sends the whole design run; the register splits a
      // piece across two columns, so this is the only place the run survives.
      runNo: typeof body.runNo === "string" ? body.runNo : undefined,
    });
    if (!added.length) {
      return NextResponse.json({ error: "Every row was blank." }, { status: 400 });
    }
    // Diamonds on the jangad are what the receipt chase is waiting for.
    // Closing it here stops the reminders within the second rather than at the
    // next check.
    await finishReceiptChasesQuietly(added);
    return NextResponse.json({ rows: added });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the entries." },
      { status: 503 }
    );
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const incoming = Array.isArray(body.rows) ? body.rows : [];
  const patches = incoming
    .map((raw) => {
      const r = raw as Record<string, unknown>;
      return { id: typeof r.id === "string" ? r.id : "", row: normalizeJangadRow(r) };
    })
    .filter((p) => p.id);

  if (!patches.length) {
    return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  }

  try {
    const saved = await updateJangadRows(patches);
    return NextResponse.json({ rows: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save the entries." },
      { status: 503 }
    );
  }
}
