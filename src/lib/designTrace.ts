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
import { findByDesignNo, type PdSheet } from "./pdStore";
import { listDemands } from "./demandStore";
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

// `query` is a design number or one piece of one. A piece wins when both match,
// which is what makes "…-63" answer about that piece rather than the whole run.
export async function traceDesign(query: string): Promise<DesignTrace | null> {
  const hits = await findByDesignNo(query);
  if (!hits.length) return null;
  const { sheet, hit } = hits[0];
  const pieceNo = hit.kind === "piece" ? hit.piece : sheet.sku;

  const [demands, jangad] = await Promise.all([
    listDemands().catch(() => []),
    listJangad().catch(() => [] as JangadRow[]),
  ]);

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
