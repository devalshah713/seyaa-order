// An approved order, as the boxes of a new PD sheet.
//
// This is a prefill and not an edit. The PD sheet does not exist yet, and when
// it is saved it becomes its own record: nothing here is copied again
// afterwards, and correcting the sheet never writes back to the order.
//
// Pure on purpose — no store, no session, no "server-only". It is handed an
// order and gives back the boxes, so it can be exercised on its own and so the
// form has no say in what maps across.
import type { Order } from "./memoStore";
import { BLANK_DIA_LINE, parseShapes, type DiaLine } from "./pdConfig";

// The boxes a new sheet can arrive with filled in. Every one is a string
// because that is what the form holds; `diaLines` is the one structured field,
// because the diamond picker reads rows and not a sentence.
export type PdPrefill = {
  photoPath: string;
  photoPublicId: string;
  sku: string;
  product: string;
  category: string;
  subCategory: string;
  subSubCategory: string;
  size: string;
  tdw: string;
  diaShape: string;
  goldPurity: string;
  goldColor: string;
  quantity: string;
  remarks: string;
  diaLines: DiaLine[];
};

// The order writes the purity and the colour together, "14KT YELLOW", because
// the office treats that as one fact. The PD sheet keeps them in two boxes, so
// the line is read apart again here.
//
// Platinum and silver are not a purity and a colour at all: they go in the
// purity box whole and leave the colour empty, which is how a platinum sheet
// has always been filled in by hand.
const COLORS: Record<string, string> = {
  WHITE: "White Gold",
  YELLOW: "Yellow Gold",
  ROSE: "Rose Gold",
};

export function goldApart(goldDetails: string): { purity: string; color: string } {
  // "18KT WHITE" is what the list offers now. Orders taken before it existed
  // carry what was typed that day — "18KT WHITE GOLD", or just "Yellow" — so
  // the word GOLD on the end is dropped and a line that is only a colour is
  // still read as one.
  const raw = (goldDetails || "").trim().toUpperCase().replace(/\s*GOLD\s*$/, "").trim();
  if (!raw) return { purity: "", color: "" };
  const m = /^(\d+\s*KT)\s*(.*)$/.exec(raw);
  if (!m) return COLORS[raw] ? { purity: "", color: COLORS[raw] } : { purity: raw, color: "" };
  return { purity: m[1].replace(/\s+/g, ""), color: COLORS[m[2].trim()] || "" };
}

// One diamond row per shape the order names.
//
// The sieve size only goes on a round row, because that box is a sieve and a
// fancy shape is measured in MM instead. The stone count only goes on at all
// when the order names a single shape: splitting one approximate count across
// two shapes would be the portal making a number up.
function diaLinesOf(o: Pick<Order, "diaShape" | "sieveSize" | "stonePcs">): DiaLine[] {
  const shapes = parseShapes(o.diaShape || "");
  if (!shapes.length) return [];
  const sieve = (o.sieveSize || "").trim();
  const pcs = shapes.length === 1 && o.stonePcs && o.stonePcs > 0 ? String(o.stonePcs) : "";
  return shapes.map((shape) => ({
    ...BLANK_DIA_LINE,
    shape,
    size: shape.toLowerCase() === "round" ? sieve : "",
    pcs,
  }));
}

export function pdPrefillFromOrder(o: Order): PdPrefill {
  const gold = goldApart(o.goldColor || "");
  const category = (o.category || "").trim();
  // What is being made, and then anything special about it. The sheet has one
  // free-text block, so the two go in it as two lines rather than being run
  // together into one sentence nobody wrote.
  const remarks = [(o.productName || "").trim(), (o.instructions || "").trim()]
    .filter(Boolean)
    .join("\n");

  return {
    photoPath: o.photoPath || "",
    photoPublicId: o.photoPublicId || "",
    // The design number the owner assigned is the sheet's SKU. Blank when he
    // has not assigned one yet, and then the PD sheet is given its number by
    // hand exactly as it always was.
    sku: (o.designNo || "").trim(),
    // The category is the product: one value under two names, which is what
    // every PD sheet already stores.
    product: category,
    category,
    subCategory: (o.subCategory || "").trim(),
    subSubCategory: (o.subSubCategory || "").trim(),
    size: (o.size || "").trim(),
    tdw: o.diamondCts && o.diamondCts > 0 ? String(o.diamondCts) : "",
    diaShape: (o.diaShape || "").trim(),
    goldPurity: gold.purity,
    goldColor: gold.color,
    quantity: o.pcs && o.pcs > 0 ? String(o.pcs) : "",
    remarks,
    diaLines: diaLinesOf(o),
  };
}
