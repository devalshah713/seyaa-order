// Everything the portal knows under one design number.
//
// The design number is the thread that runs through the whole business: it is
// given on the PD sheet, the diamond demand is raised against it, the stones go
// out on a jangad against it, and the finished piece comes into stock under it.
// Each module already stores its own part; this pulls the four together so a
// number typed anywhere answers with the whole story rather than a quarter of it.
//
// Nothing here writes. It reads the four stores and returns a summary, which is
// what a screen taking a piece into stock needs: the boxes it can fill in for
// itself, and the history beside them so the person holding the piece can see
// it is the right one.
import "server-only";
import { listPdSheetsRaw, type PdSheet } from "./pdStore";
import { listDemands, type Demand } from "./demandStore";
import { listJangad } from "./jangadStore";
import { joinDesignNo, matchDesign } from "./designNo";
import type { JangadRow } from "./jangadConfig";

export type TraceStage = {
  // One line per thing that happened, in the order it happened.
  label: string;
  value: string;
};

export type DesignTrace = {
  pieceNo: string; // what was asked for, or the piece it resolved to
  designNo: string; // the run as the PD sheet writes it
  pdId: string;
  pdNo: string;

  // What the PD sheet says the piece is. These fill the entry's own boxes.
  // Not the description or the location: the first is written by whoever has
  // the piece in hand, and the second is where the piece is now rather than
  // where the sheet means to send it.
  product: string;
  category: string;
  subCategory: string;
  subSubCategory: string;
  goldDetails: string;
  inchSize: string;
  goldWeight: string; // the design's target, for checking a weighed piece against
  diaQuality: string;
  mfgName: string;

  // The paper trail, for showing rather than filling in.
  pd: TraceStage[];
  demand: TraceStage[];
  issue: TraceStage[];
  demandNos: string[];
  memoNos: string[];
};

const clean = (s: string) => (s || "").trim();

// "14KT" + "White Gold" → "14K WHITE", which is how the stock sheet writes it
// and what the price lookup reads the purity out of.
export function goldDetailsOf(purity: string, colour: string): string {
  const p = clean(purity).toUpperCase().replace(/\s*K\s*T\b/, "K");
  const c = clean(colour).toUpperCase().replace(/\s*GOLD\b/, "");
  return [p, c].filter(Boolean).join(" ");
}

const stage = (label: string, value: string): TraceStage[] =>
  clean(value) ? [{ label, value: clean(value) }] : [];

// Adds up a column across a set of register rows.
function total(rows: JangadRow[], key: keyof JangadRow): string {
  let sum = 0;
  let any = false;
  for (const r of rows) {
    const n = Number(clean(String(r[key] ?? "")));
    if (Number.isFinite(n) && clean(String(r[key] ?? ""))) { sum += n; any = true; }
  }
  return any ? String(parseFloat(sum.toFixed(3))) : "";
}

const uniq = (list: string[]) => [...new Set(list.map(clean).filter(Boolean))];

// The three registers a trace reads, loaded once.
//
// Tracing one design number is cheap; the loading in front of it is not. A
// caller tracing a hundred pieces one at a time used to fetch and parse all
// three documents a hundred times over, which on a ten millisecond request
// budget is why the stock screen stopped rendering. So the loading is separated
// out: read once, then trace as many numbers as needed against what was read.
export type TraceSources = { sheets: PdSheet[]; demands: Demand[]; jangad: JangadRow[] };

// `have` lets a caller hand over rows it has already read, so the same document
// is not fetched and parsed a second time.
export async function loadTraceSources(
  have: { jangad?: JangadRow[] } = {}
): Promise<TraceSources> {
  const [sheets, demands, jangad] = await Promise.all([
    // No catch here on purpose. A PD book that cannot be reached must not read
    // as a book with no sheets in it, or the trace would quietly answer
    // "nothing known" about a design it simply could not look up.
    listPdSheetsRaw(),
    listDemands().catch(() => [] as Demand[]),
    have.jangad ? Promise.resolve(have.jangad) : listJangad().catch(() => [] as JangadRow[]),
  ]);
  return { sheets, demands, jangad };
}

// `query` is a design number or one piece of one. A piece wins when both match,
// which is what makes "…-63" answer about that piece rather than the whole run.
export async function traceDesign(query: string): Promise<DesignTrace | null> {
  return traceDesignFrom(await loadTraceSources(), query);
}

// The trace itself, with nothing left to wait for.
export function traceDesignFrom(src: TraceSources, query: string): DesignTrace | null {
  // Which sheet answers for the number.
  //
  // The sheets are walked once, keeping the first match and replacing it the
  // first time a piece match turns up. That is the same sheet the old code
  // picked, which collected every match in sheet order and then sorted piece
  // matches ahead of design matches with a stable sort. A stable sort leaves
  // equal items in the order they were in, so the sorted list began with the
  // piece matches in sheet order and was followed by the design matches in
  // sheet order. Its first entry was therefore the earliest piece match when
  // the book held one, and otherwise the earliest match of any kind: exactly
  // what keeping the first match and upgrading once on the first piece match
  // leaves behind. A design match found before a piece match is replaced by it,
  // and with no piece match anywhere the first match of any kind stands.
  let found: { sheet: PdSheet; piece: string } | null = null;
  for (const sheet of src.sheets) {
    const hit = matchDesign(sheet.sku, query);
    if (!hit) continue;
    const isPiece = hit.kind === "piece";
    if (!found) {
      found = { sheet, piece: isPiece ? hit.piece : sheet.sku };
      if (isPiece) break;
      continue;
    }
    if (isPiece) {
      found = { sheet, piece: hit.piece };
      break;
    }
  }
  if (!found) return null;
  const { sheet } = found;
  const pieceNo = found.piece;

  const demands = src.demands;
  const jangad = src.jangad;

  // Demands raised against this sheet, plus any whose rows name the design —
  // a demand can be raised without going through the sheet.
  const mine = demands.filter(
    (d) =>
      (sheet.id && d.pdId === sheet.id) ||
      d.rows.some((r) => r.designNo && matchDesign(r.designNo, pieceNo))
  );

  // The register keeps the design and the piece in separate columns, so the
  // number being looked for has to be put back together to match against.
  const rows = jangad.filter((r) => {
    const full = joinDesignNo(r.designNo, r.subDesignNo, "");
    return full ? !!matchDesign(full, pieceNo) : false;
  });

  return {
    pieceNo,
    designNo: sheet.sku,
    pdId: sheet.id,
    pdNo: sheet.pdNo,

    product: sheet.product,
    category: sheet.category,
    subCategory: sheet.subCategory,
    subSubCategory: sheet.type,
    goldDetails: goldDetailsOf(sheet.goldPurity, sheet.goldColor),
    inchSize: sheet.size,
    goldWeight: sheet.goldWeight,
    diaQuality: sheet.diaQuality,
    mfgName: rows.find((r) => r.mfgName)?.mfgName || sheet.assignedTo,

    pd: [
      ...stage("PD sheet", sheet.pdNo),
      ...stage("Design number", sheet.sku),
      ...stage("Assigned to", sheet.assignedTo),
      ...stage("Assigned", sheet.assignedDate),
      ...stage("Delivery", sheet.deliveryDate),
      ...stage("Diamond quality", sheet.diaQuality),
      ...stage("Gold", [sheet.goldPurity, sheet.goldColor].filter(Boolean).join(" ")),
      ...stage("Gold weight", sheet.goldWeight),
      ...stage("Size", sheet.size),
      // Where the sheet means the piece to end up. Said here rather than
      // written into Location, which is where the piece is today.
      ...stage("Zone", sheet.zone),
      ...stage("Order", [sheet.orderType, sheet.orderBy].filter(Boolean).join(" · ")),
      ...stage("Remarks", sheet.remarks),
    ],
    demand: mine.flatMap((d) => [
      ...stage("Demand", d.demandNo),
      ...stage("Raised", d.date),
      ...stage("Issued to", d.issuedTo),
      ...stage("Growth", uniq(d.rows.map((r) => r.growth)).join(", ")),
    ]),
    issue: rows.length
      ? [
          ...stage("Memo", uniq(rows.map((r) => r.memoNo)).join(", ")),
          ...stage("Issued", uniq(rows.map((r) => r.date)).join(", ")),
          ...stage("To", uniq(rows.map((r) => r.mfgName)).join(", ")),
          ...stage("Issued cts", total(rows, "carats")),
          ...stage("Studded cts", total(rows, "ctsUsed")),
          ...stage("Returned cts", total(rows, "ctsReturn")),
          ...stage("Received", uniq(rows.map((r) => r.receivedDate)).join(", ")),
        ]
      : [],
    demandNos: uniq(mine.map((d) => d.demandNo)),
    memoNos: uniq(rows.map((r) => r.memoNo)),
  };
}

export type { PdSheet };
