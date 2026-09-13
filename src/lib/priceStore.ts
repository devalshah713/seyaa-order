// The price list, kept in the portal so gold and labour rates can be changed
// the day they change, rather than in a spreadsheet somebody has to remember to
// send round.
//
// Prices are read live: a piece already in stock is worth what today's rates
// say it is worth, exactly as the workbook behaves when its rate cell is
// edited. Nothing is stamped onto an entry.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
import { SEED_PRICES } from "./priceSeed";
import type { ByKarat, FancyPrice, PriceList, RoundPrice } from "./priceList";

const DB_PATH = "prices/db.json";

export function isPriceStorageConfigured(): boolean {
  return isDbConfigured();
}

// Before anyone has edited anything the seed from the company's own workbook
// is the price list, so the module works from the first day without a setup step.
export async function loadPrices(): Promise<PriceList> {
  // Prices are read on nearly every screen that shows a value, so an
  // unconfigured portal falls back to the seed rather than throwing: a missing
  // setting should leave the stock book priced from the workbook, not blank.
  if (!isDbConfigured()) return SEED_PRICES;
  const db = await readDoc<Partial<PriceList>>(DB_PATH, {});
  return {
    rates: db.rates || SEED_PRICES.rates,
    round: db.round || SEED_PRICES.round,
    fancy: db.fancy || SEED_PRICES.fancy,
  };
}

export async function savePrices(list: PriceList): Promise<PriceList> {
  await writeDoc(DB_PATH, list);
  return list;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const numOrNull = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = str(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const money = (v: unknown, fallback: { usd: number; inr: number }) => {
  const o = (v || {}) as Record<string, unknown>;
  return { usd: numOrNull(o.usd) ?? fallback.usd, inr: numOrNull(o.inr) ?? fallback.inr };
};
const byKarat = (v: unknown, fallback: ByKarat): ByKarat => {
  const o = (v || {}) as Record<string, unknown>;
  return { k14: money(o.k14, fallback.k14), k18: money(o.k18, fallback.k18) };
};

// A rate is never left empty: a blank gold price would quietly value every
// piece in stock at its diamonds alone, so anything unreadable keeps the figure
// it had.
export function normalizePriceList(body: unknown): PriceList {
  const b = (body || {}) as Record<string, unknown>;
  const rates = (b.rates || {}) as Record<string, unknown>;
  const round = Array.isArray(b.round) ? b.round : [];
  const fancy = Array.isArray(b.fancy) ? b.fancy : [];
  return {
    rates: {
      gold: byKarat(rates.gold, SEED_PRICES.rates.gold),
      labour: byKarat(rates.labour, SEED_PRICES.rates.labour),
      polkiLabour: byKarat(rates.polkiLabour, SEED_PRICES.rates.polkiLabour),
    },
    round: round
      .map((raw): RoundPrice => {
        const r = raw as Record<string, unknown>;
        return {
          code: str(r.code), sieve: str(r.sieve), mm: str(r.mm),
          pointers: str(r.pointers), usd: numOrNull(r.usd), inr: numOrNull(r.inr),
        };
      })
      .filter((r) => r.code),
    fancy: fancy
      .map((raw): FancyPrice => {
        const f = raw as Record<string, unknown>;
        return {
          code: str(f.code), shape: str(f.shape), pointers: str(f.pointers),
          mm: str(f.mm), usd: numOrNull(f.usd), inr: numOrNull(f.inr),
        };
      })
      .filter((f) => f.code),
  };
}
