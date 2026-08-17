import { NextRequest, NextResponse } from "next/server";
import { exportDb } from "@/lib/memoStore";
import { exportPdDb } from "@/lib/pdStore";
import { exportDemandDb } from "@/lib/demandStore";
import { exportJangadDb } from "@/lib/jangadStore";
import { buildJangadWorkbook } from "@/lib/jangadExport";
import { buildMemoWorkbook } from "@/lib/memoExport";
import { exportStockBookDb, listStockEntries } from "@/lib/stockBookStore";
import { loadPrices } from "@/lib/priceStore";
import { buildStockWorkbook } from "@/lib/stockBookExport";
import { isBackupConfigured, tokenOk } from "@/lib/backup";

// Secret-protected backup download for the user's own PC to pull nightly.
//   ?format=json   -> full restorable database (counters + memos)
//   ?format=xlsx   -> readable Excel of all memos
//   ?format=jangad -> the diamond jangad register in the accounts workbook
//   ?format=stockbook -> the stock book in the company's own stock workbook
// Auth: `x-backup-token` header or `?token=` must equal BACKUP_TOKEN.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<Response> {
  if (!isBackupConfigured()) {
    return NextResponse.json(
      { error: "Backup is not configured. Set BACKUP_TOKEN in Vercel." },
      { status: 501 }
    );
  }
  if (!tokenOk(req)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const format = (req.nextUrl.searchParams.get("format") || "json").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    // The accounts team's own workbook, so the nightly copy on the PC includes
    // the register in the format they already work in.
    if (format === "jangad") {
      const db = await exportJangadDb();
      const buffer = await buildJangadWorkbook(db.rows);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="Diamond Jangad ${stamp}.xlsx"`,
          "cache-control": "no-store",
        },
      });
    }

    // The stock book, priced at today's rates — the same file the office
    // already keeps, three sheets and all.
    if (format === "stockbook") {
      const [entries, prices] = await Promise.all([listStockEntries(), loadPrices()]);
      const buffer = await buildStockWorkbook(entries, prices);
      return new NextResponse(new Uint8Array(buffer), {
        status: 200,
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="Seyaa Stock ${stamp}.xlsx"`,
          "cache-control": "no-store",
        },
      });
    }

    if (format === "xlsx") {
      const db = await exportDb();
      const buffer = await buildMemoWorkbook(db.memos, db.events);
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "content-disposition": `attachment; filename="Seyaa Memos ${stamp}.xlsx"`,
          "cache-control": "no-store",
        },
      });
    }

    // Default: JSON — the restorable database (memos + PD sheets). `memos` and
    // `counters` stay at the top level so existing backups/restores keep working.
    const db = await exportDb();
    const pd = await exportPdDb().catch(() => ({ counters: {}, sheets: [] }));
    const demand = await exportDemandDb().catch(() => ({ counters: {}, demands: [] }));
    const jangad = await exportJangadDb().catch(() => ({ rows: [], seq: 0 }));
    const stockbook = await exportStockBookDb().catch(() => ({ entries: [], seq: 0 }));
    // The price list goes with it: without the rates, the stock book's own
    // figures cannot be worked out again from the backup.
    const prices = await loadPrices().catch(() => null);
    return new NextResponse(JSON.stringify({ ...db, pd, demand, jangad, stockbook, prices }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="seyaa-memos-${stamp}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backup failed." },
      { status: 500 }
    );
  }
}
