// Stock book store — same private Vercel Blob pattern as the other modules.
import "server-only";
import { get, put, BlobNotFoundError } from "@vercel/blob";
import {
  BLANK_LINE, hasContent, suggestCode,
  type NewStockEntry, type StockEntry, type StockLine,
} from "./stockBookConfig";
import { loadPrices } from "./priceStore";
import { listJangad, getJangadRows } from "./jangadStore";
import { getPdSheet } from "./pdStore";
import { joinDesignNo } from "./designNo";
import { todayInput } from "./memoFormat";

const DB_PATH = "stockbook/db.json";

export type StockBookDB = { entries: StockEntry[]; seq: number };

export function isStockBookConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function requireToken(): string {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    throw new Error(
      "Storage is not configured. Add the BLOB_READ_WRITE_TOKEN environment variable in Vercel and redeploy."
    );
  }
  return token;
}

async function readDB(token: string): Promise<StockBookDB> {
  try {
    const result = await get(DB_PATH, { access: "private", token, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return { entries: [], seq: 0 };
    const db = (await new Response(result.stream).json()) as Partial<StockBookDB>;
    return { entries: db.entries || [], seq: db.seq || 0 };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return { entries: [], seq: 0 };
    throw err;
  }
}

async function writeDB(db: StockBookDB, token: string): Promise<void> {
  await put(DB_PATH, JSON.stringify(db), {
    access: "private",
    token,
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function normalizeStockInput(body: Record<string, unknown>): NewStockEntry {
  const rawLines = Array.isArray(body.lines) ? body.lines : [];
  const lines: StockLine[] = rawLines
    .map((raw) => {
      const l = raw as Partial<StockLine>;
      return {
        breakupWt: s(l.breakupWt), pcs: s(l.pcs), shape: s(l.shape),
        sieve: s(l.sieve), code: s(l.code),
      };
    })
    .filter(hasContent);

  return {
    stockNo: s(body.stockNo),
    date: s(body.date) || todayInput(),
    design: s(body.design),
    designNo: s(body.designNo),
    category: s(body.category),
    subCategory: s(body.subCategory),
    subSubCategory: s(body.subSubCategory),
    location: s(body.location),
    goldDetails: s(body.goldDetails),
    inchSize: s(body.inchSize),
    grossWt: s(body.grossWt),
    netWt: s(body.netWt),
    partyName: s(body.partyName),
    polkiLabour: body.polkiLabour === true,
    lines: lines.length ? lines : [{ ...BLANK_LINE }],
    comments: s(body.comments),
    jangadIds: Array.isArray(body.jangadIds)
      ? body.jangadIds.filter((x): x is string => typeof x === "string")
      : undefined,
    pdId: s(body.pdId) || undefined,
    pdNo: s(body.pdNo) || undefined,
  };
}

export async function listStockEntries(): Promise<StockEntry[]> {
  const token = requireToken();
  const db = await readDB(token);
  return db.entries.slice().sort((a, b) =>
    a.createdAt === b.createdAt
      ? a.stockNo.localeCompare(b.stockNo, undefined, { numeric: true })
      : a.createdAt < b.createdAt ? 1 : -1
  );
}

export async function getStockEntry(id: string): Promise<StockEntry | null> {
  const token = requireToken();
  const db = await readDB(token);
  return db.entries.find((e) => e.id === id) || null;
}

// Stock numbers run S0001, S0002 … The book keeps its own counter rather than
// counting rows, so deleting an entry never hands its number to the next piece.
export function stockNoFor(seq: number): string {
  return `S${String(seq).padStart(4, "0")}`;
}

export async function nextStockNo(): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return stockNoFor(1);
  const db = await readDB(token);
  return stockNoFor(db.seq + 1);
}

export async function createStockEntry(input: NewStockEntry): Promise<StockEntry> {
  const token = requireToken();
  const db = await readDB(token);
  db.seq += 1;
  const now = new Date().toISOString();
  const entry: StockEntry = {
    ...input,
    // A number typed by hand wins — pieces come in from elsewhere with numbers
    // already on them — but the counter still moves, so the next one is free.
    stockNo: input.stockNo || stockNoFor(db.seq),
    id: `SB-${String(db.seq).padStart(5, "0")}`,
    createdAt: now,
    updatedAt: now,
  };
  db.entries.push(entry);
  await writeDB(db, token);

  // The jangad register asks for a Stock Code on every line of the piece; this
  // is where that code comes from, so it is written back rather than copied
  // across by hand. Best-effort: the stock entry is saved either way.
  if (entry.jangadIds?.length) {
    await stampJangadStockCode(entry.jangadIds, entry.stockNo).catch(() => {});
  }
  return entry;
}

export async function updateStockEntry(
  id: string,
  patch: NewStockEntry
): Promise<StockEntry | null> {
  const token = requireToken();
  const db = await readDB(token);
  const idx = db.entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const before = db.entries[idx];
  const updated: StockEntry = {
    ...before,
    ...patch,
    stockNo: patch.stockNo || before.stockNo,
    // Where the piece came from is not on the form, so an edit that does not
    // carry the link keeps the one the entry already had rather than cutting
    // the stock number loose from its jangad entries.
    jangadIds: patch.jangadIds ?? before.jangadIds,
    pdId: patch.pdId ?? before.pdId,
    pdNo: patch.pdNo ?? before.pdNo,
    updatedAt: new Date().toISOString(),
  };
  db.entries[idx] = updated;
  await writeDB(db, token);
  return updated;
}

export async function deleteStockEntry(id: string): Promise<boolean> {
  const token = requireToken();
  const db = await readDB(token);
  const gone = db.entries.find((e) => e.id === id);
  if (!gone) return false;
  db.entries = db.entries.filter((e) => e.id !== id);
  await writeDB(db, token);

  // The Stock Code stamped on the jangad lines is what keeps the piece from
  // being offered again, so removing the entry has to take the stamp off with
  // it — otherwise an entry made by mistake locks the piece out for good.
  if (gone.jangadIds?.length) {
    await stampJangadStockCode(gone.jangadIds, "", gone.stockNo).catch(() => {});
  }
  return true;
}

export async function exportStockBookDb(): Promise<StockBookDB> {
  const token = requireToken();
  return readDB(token);
}

// --- Taking a piece in from the jangad register ------------------------------

export type StockSeedPiece = {
  key: string; // design + piece, how the register writes it
  pieceNo: string;
  designNo: string;
  subDesignNo: string;
  product: string;
  mfgName: string;
  stockCode: string; // already in stock if this is filled
  jangadIds: string[];
  pdId?: string;
  pdNo?: string;
  // Off the PD sheet, so the entry starts filled in rather than blank.
  design: string;
  category: string;
  subCategory: string;
  goldDetails: string;
  lines: StockLine[];
};

// Every piece the register knows about, with its diamond lines gathered into
// the shape a stock entry wants. What came back studded is what is now in the
// jewellery, so the used figures are the ones carried across — not what went
// out, some of which came back loose.
export async function piecesForStock(): Promise<StockSeedPiece[]> {
  const [rows, prices] = await Promise.all([listJangad(), loadPrices()]);
  const byPiece = new Map<string, StockSeedPiece>();

  for (const r of rows) {
    const pieceNo = joinDesignNo(r.designNo, r.subDesignNo, "");
    if (!pieceNo) continue;
    const key = pieceNo.toUpperCase();
    let p = byPiece.get(key);
    if (!p) {
      p = {
        key, pieceNo, designNo: r.designNo, subDesignNo: r.subDesignNo,
        product: r.product, mfgName: r.mfgName, stockCode: r.stockCode,
        jangadIds: [], pdId: r.pdId, pdNo: r.pdNo,
        design: r.product, category: "", subCategory: "", goldDetails: "",
        lines: [],
      };
      byPiece.set(key, p);
    }
    p.jangadIds.push(r.id);
    if (r.stockCode && !p.stockCode) p.stockCode = r.stockCode;
    if (!p.product && r.product) p.product = r.product;

    const line: StockLine = {
      // What was studded, which is what is in the piece now.
      breakupWt: r.ctsUsed || r.carats,
      pcs: r.pcsUsed || r.pcs,
      shape: r.shape,
      sieve: r.size,
      code: "",
    };
    line.code = suggestCode(prices, line);
    if (hasContent(line)) p.lines.push(line);
  }

  // The PD sheet says what the piece is and what gold it is in — the boxes on a
  // stock entry that would otherwise be typed out again for every piece of a run.
  const pdIds = [...new Set([...byPiece.values()].map((p) => p.pdId).filter(Boolean))] as string[];
  const sheets = await Promise.all(pdIds.map((id) => getPdSheet(id).catch(() => null)));
  const byPd = new Map(pdIds.map((id, i) => [id, sheets[i]]));
  for (const p of byPiece.values()) {
    const sheet = p.pdId ? byPd.get(p.pdId) : null;
    if (!sheet) continue;
    p.design = sheet.product || p.design;
    p.category = sheet.category;
    p.subCategory = sheet.subCategory;
    p.goldDetails = goldDetailsOf(sheet.goldPurity, sheet.goldColor);
  }

  return [...byPiece.values()].sort((a, b) =>
    a.pieceNo.localeCompare(b.pieceNo, undefined, { numeric: true })
  );
}

// The stock book writes the gold as one phrase — "14K WHITE" — and reads the
// purity back out of it to pick the gold rate. The PD sheet keeps the two apart,
// so they are put together here in the form the price lookup expects.
export function goldDetailsOf(purity: string, colour: string): string {
  // "14KT", "14 K", "14kt Gold" all become "14K", which is what karatOf reads.
  const p = (purity || "").trim().toUpperCase().replace(/\s*K\s*T\b/, "K");
  return [p, (colour || "").trim().toUpperCase()].filter(Boolean).join(" ");
}

// Writes the stock number into the Stock Code column of every jangad line for
// the piece — the register's own record of when it left the workshop.
//
// `only` clears the stamp rather than setting one: it names the number being
// taken off, so a line already carrying a different stock number — a piece
// entered again by hand, say — is left exactly as it is.
async function stampJangadStockCode(
  ids: string[],
  stockNo: string,
  only?: string
): Promise<void> {
  const rows = await getJangadRows(ids);
  const wanted = only === undefined ? rows : rows.filter((r) => r.stockCode === only);
  if (!wanted.length) return;
  const { updateJangadRows } = await import("./jangadStore");
  await updateJangadRows(
    wanted.map((r) => ({ id: r.id, row: { ...r, stockCode: stockNo } }))
  );
}
