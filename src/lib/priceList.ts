// What a finished piece is worth, worked out exactly as the company's stock
// workbook works it out.
//
// Three things are added together, in dollars and in rupees side by side:
//
//   diamonds  each stone size's weight × the per-carat price for its Product
//             Code — the round table first, the fancy table if the code is not
//             in it, which is what the sheet's IFERROR(VLOOKUP, VLOOKUP) means
//   gold      net weight × the gold rate per gram
//   labour    net weight × the labour rate per gram
//
// Gold and labour are charged on NET weight, not gross: the stones are not
// gold. They are charged once per piece however many stone sizes it has.
//
// Nothing here touches storage, so the browser prices a piece as you type and
// the server prices it again on the way in.

export type Money = { usd: number; inr: number };
export type ByKarat = { k14: Money; k18: Money };

export type RoundPrice = {
  code: string; // Product Code, e.g. "+6.5-11 : 01"
  sieve: string;
  mm: string;
  pointers: string;
  usd: number | null; // per carat
  inr: number | null;
};

export type FancyPrice = {
  code: string; // e.g. "OV : 01", "PO : 01", "DIA : 01"
  shape: string;
  pointers: string;
  mm: string;
  usd: number | null;
  inr: number | null;
};

export type PriceList = {
  rates: { gold: ByKarat; labour: ByKarat; polkiLabour: ByKarat };
  round: RoundPrice[];
  fancy: FancyPrice[];
};

export const ZERO: Money = { usd: 0, inr: 0 };

// Product Codes are typed by hand and read off a printed list, so they are
// matched without their spacing: "OV:01", "ov : 01" and "OV : 01" are one code.
export function codeKey(code: string): string {
  return (code || "").toUpperCase().replace(/\s+/g, "");
}

export type PriceHit = {
  code: string;
  table: "round" | "fancy";
  usd: number | null;
  inr: number | null;
  label: string; // what the row says, for showing back on the form
};

// The round table is searched first and the fancy one second — the order the
// workbook's nested lookup uses. No code appears in both.
export function findPrice(list: PriceList, code: string): PriceHit | null {
  const key = codeKey(code);
  if (!key) return null;
  const r = list.round.find((x) => codeKey(x.code) === key);
  if (r) {
    return {
      code: r.code, table: "round", usd: r.usd, inr: r.inr,
      label: [r.sieve, r.mm && `${r.mm} mm`].filter(Boolean).join(" · "),
    };
  }
  const f = list.fancy.find((x) => codeKey(x.code) === key);
  if (f) {
    return {
      code: f.code, table: "fancy", usd: f.usd, inr: f.inr,
      label: [f.shape, f.mm].filter(Boolean).join(" · "),
    };
  }
  return null;
}

// --- Gold purity -------------------------------------------------------------
// The purity is written into the gold description — "14K WHITE", "18K YELLOW" —
// so it is read from there rather than asked for twice.
export function karatOf(goldDetails: string): 14 | 18 {
  return /18\s*K/i.test(goldDetails || "") ? 18 : 14;
}

export function rateFor(by: ByKarat, karat: 14 | 18): Money {
  return karat === 18 ? by.k18 : by.k14;
}

// --- Working a piece out -----------------------------------------------------

export type PricedLine = {
  code: string;
  found: boolean; // false when the Product Code is not in either table
  breakupWt: number | null;
  pcs: number | null;
  pointer: number | null; // this size's weight per stone
  diamond: Money;
};

export type PricedPiece = {
  lines: PricedLine[];
  totalWeight: number; // carats over every size
  totalPcs: number;
  pointer: number | null; // the piece's average, total weight over total stones
  diamond: Money;
  gold: Money;
  labour: Money;
  total: Money;
  karat: 14 | 18;
  unknownCodes: string[]; // codes that priced at nothing, so the total is short
};

export function num(v: string | number | null | undefined): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = (v ?? "").toString().trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type PieceInput = {
  netWt: string;
  goldDetails: string;
  polkiLabour?: boolean;
  lines: { breakupWt: string; pcs: string; code: string }[];
};

export function pricePiece(list: PriceList, piece: PieceInput): PricedPiece {
  const karat = karatOf(piece.goldDetails);
  const net = num(piece.netWt) ?? 0;

  const unknownCodes: string[] = [];
  const lines: PricedLine[] = piece.lines.map((l) => {
    const wt = num(l.breakupWt);
    const pcs = num(l.pcs);
    const hit = findPrice(list, l.code);
    if (l.code.trim() && !hit) unknownCodes.push(l.code.trim());
    const per = hit || { usd: null, inr: null };
    return {
      code: l.code,
      found: !!hit,
      breakupWt: wt,
      pcs,
      pointer: wt !== null && pcs ? wt / pcs : null,
      diamond: {
        usd: wt !== null && per.usd !== null ? wt * per.usd : 0,
        inr: wt !== null && per.inr !== null ? wt * per.inr : 0,
      },
    };
  });

  const totalWeight = lines.reduce((n, l) => n + (l.breakupWt ?? 0), 0);
  const totalPcs = lines.reduce((n, l) => n + (l.pcs ?? 0), 0);
  const diamond = lines.reduce(
    (m, l) => ({ usd: m.usd + l.diamond.usd, inr: m.inr + l.diamond.inr }),
    { ...ZERO }
  );

  const goldRate = rateFor(list.rates.gold, karat);
  // A polki piece is set differently and costs more to make, which is what the
  // second labour rate on the price list is for.
  const labourRate = rateFor(
    piece.polkiLabour ? list.rates.polkiLabour : list.rates.labour,
    karat
  );
  const gold = { usd: net * goldRate.usd, inr: net * goldRate.inr };
  const labour = { usd: net * labourRate.usd, inr: net * labourRate.inr };

  return {
    lines,
    totalWeight,
    totalPcs,
    pointer: totalPcs ? totalWeight / totalPcs : null,
    diamond,
    gold,
    labour,
    total: {
      usd: diamond.usd + gold.usd + labour.usd,
      inr: diamond.inr + gold.inr + labour.inr,
    },
    karat,
    unknownCodes: [...new Set(unknownCodes)],
  };
}

// Money is shown to the rupee and the dollar, as the workbook does; the
// underlying figures keep their full precision.
export function money(n: number, dp = 0): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-IN", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function trim(n: number | null, dp: number): string {
  if (n === null || !Number.isFinite(n)) return "";
  return String(parseFloat(n.toFixed(dp)));
}
