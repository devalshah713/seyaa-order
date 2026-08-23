// The design number is the handle on a piece of jewellery for its whole life
// before the stock sheet — from the day the PD sheet is written until the
// finished piece is entered in stock and gets a stock number of its own. So it
// has to work as a key, not just a label.
//
// Bulk production writes the run of pieces into the number itself:
//
//   SN-BR-AMF-10CT-45-49   one design, made in five pieces, numbered 45 to 49
//   SN-BR-AMF-10CT-46      the second of those five
//
// The run is not always at the end — "SS-NK-SL-KO-20CT-011-015-WG-14KT-USA"
// runs 011 to 015 with the gold and zone codes written after it — so it is
// found as the last pair of adjacent all-digit segments wherever that falls,
// and the zero padding is carried over from however it was typed.
//
// Nothing here touches storage, so both the browser and the server use it.

export type DesignRun = {
  raw: string;
  segs: string[]; // alphanumeric segments, upper-cased
  pre: string[]; // the separator written before each segment
  post: string; // anything trailing the last segment
  at: number; // index of the numbered segment; -1 when there is no number
  spanned: boolean; // the run is written as two segments, "45-49"
  from: number;
  to: number;
  width: number; // zero padding, taken from how it was typed
};

// A design number is read as segments and the separators between them, so a
// piece number can be rebuilt in the same style it was written in — dashes stay
// dashes, slashes stay slashes.
function tokenize(raw: string): { segs: string[]; pre: string[]; post: string } {
  const bits = (raw || "").trim().split(/([A-Za-z0-9.]+)/);
  const segs: string[] = [];
  const pre: string[] = [];
  let post = "";
  for (let i = 0; i < bits.length; i++) {
    if (i % 2 === 1) segs.push(bits[i].toUpperCase());
    else if (i === bits.length - 1) post = bits[i];
    else pre.push(bits[i]);
  }
  return { segs, pre, post };
}

function joinParts(segs: string[], pre: string[], post: string): string {
  return segs.map((s, i) => (pre[i] ?? "") + s).join("") + post;
}

const isDigits = (s: string) => /^[0-9]+$/.test(s);

export function parseDesignNo(raw: string): DesignRun {
  const { segs, pre, post } = tokenize(raw);
  const base = { raw: raw || "", segs, pre, post };

  // A run: two numbers side by side, low first.
  for (let i = segs.length - 2; i >= 0; i--) {
    if (isDigits(segs[i]) && isDigits(segs[i + 1]) && +segs[i] <= +segs[i + 1]) {
      return {
        ...base,
        at: i,
        spanned: true,
        from: +segs[i],
        to: +segs[i + 1],
        width: Math.max(segs[i].length, segs[i + 1].length),
      };
    }
  }
  // A single number: the design names one piece already.
  for (let i = segs.length - 1; i >= 0; i--) {
    if (isDigits(segs[i])) {
      return {
        ...base,
        at: i,
        spanned: false,
        from: +segs[i],
        to: +segs[i],
        width: segs[i].length,
      };
    }
  }
  return { ...base, at: -1, spanned: false, from: 0, to: 0, width: 0 };
}

export function pieceCount(run: DesignRun): number {
  if (run.at === -1) return run.segs.length ? 1 : 0;
  return Math.max(1, run.to - run.from + 1);
}

// The number for one piece of the run, written in the style of the design it
// came from: the two run segments collapse to the single piece number.
export function pieceNo(run: DesignRun, n: number): string {
  if (run.at === -1) return joinParts(run.segs, run.pre, run.post);
  const segs = run.segs.slice();
  const pre = run.pre.slice();
  segs[run.at] = String(n).padStart(run.width, "0");
  if (run.spanned) {
    segs.splice(run.at + 1, 1);
    pre.splice(run.at + 1, 1);
  }
  return joinParts(segs, pre, run.post);
}

// A guard on a mistyped run — "001-999" should not silently become a thousand
// rows to fill in.
export const MAX_PIECES = 400;

export function pieceNumbers(run: DesignRun): string[] {
  const count = Math.min(pieceCount(run), MAX_PIECES);
  if (run.at === -1) return count ? [pieceNo(run, 0)] : [];
  return Array.from({ length: count }, (_, i) => pieceNo(run, run.from + i));
}

// --- Writing a design number in parts ---------------------------------------
// The form asks for the design and its run separately — "SN-BR-AMF" and 41 to
// 49 — because that is how the designer thinks of it. What gets stored is still
// the one number, "SN-BR-AMF-41-49", so nothing downstream has to care.

export function joinDesignNo(base: string, from: string, to: string): string {
  // A trailing separator on the base would double up when the run is added.
  const b = base.trim().replace(/[^A-Za-z0-9.]+$/, "");
  const f = from.trim();
  const t = to.trim();
  if (!f) return b;
  const run = t && t !== f ? `${f}-${t}` : f;
  return b ? `${b}-${run}` : run;
}

// The reverse, for reopening a saved sheet. Only a run written at the very end
// splits: a number with codes after it ("…-011-015-WG-14KT-USA") is handed back
// whole rather than having its tail quietly dropped. It still works everywhere
// else — parseDesignNo finds the run wherever it sits.
export function splitDesignNo(sku: string): { base: string; from: string; to: string } {
  const whole = { base: sku, from: "", to: "" };
  const run = parseDesignNo(sku);
  if (run.at === -1) return whole;
  const after = run.at + (run.spanned ? 2 : 1);
  if (after !== run.segs.length) return whole;
  return {
    base: joinParts(run.segs.slice(0, run.at), run.pre.slice(0, run.at), ""),
    from: run.segs[run.at],
    to: run.spanned ? run.segs[run.at + 1] : "",
  };
}

// The jangad register writes a piece across two columns — the design it belongs
// to and the piece's own number, "SN-BR-AMF-10CT" and "63" — rather than the
// joined piece number. joinDesignNo puts them back together.
export function splitPiece(pieceNo: string): { design: string; sub: string } {
  const run = parseDesignNo(pieceNo);
  if (run.at === -1) return { design: pieceNo, sub: "" };
  const segs = run.segs.slice();
  const pre = run.pre.slice();
  const sub = segs[run.at];
  segs.splice(run.at, 1);
  pre.splice(run.at, 1);
  return { design: joinParts(segs, pre, run.post), sub };
}

const flat = (s: string) => s.toUpperCase().replace(/[^A-Z0-9.]/g, "");
const sameSegs = (a: string[], b: string[]) =>
  a.length === b.length && a.every((s, i) => s === b[i]);
const isPrefix = (short: string[], long: string[]) =>
  short.length <= long.length && short.every((s, i) => s === long[i]);

export type DesignHit = {
  // "piece" — the search named one piece of this design;
  // "design" — it matched the design number as text.
  kind: "piece" | "design";
  piece: string;
  n: number | null;
};

// Decide whether a typed search names this design, and if so which piece of it.
//
// Typing "SN-BR-AMF-10CT-46" has to reach the sheet written as
// "SN-BR-AMF-10CT-45-49", because piece 46 has no record of its own until it
// reaches the stock sheet. Anything short of that falls back to matching the
// design number as plain text, so half a number still narrows the list.
export function matchDesign(sku: string, query: string): DesignHit | null {
  const q = (query || "").trim();
  if (!q || !sku.trim()) return null;

  const run = parseDesignNo(sku);
  const asked = parseDesignNo(q);

  // One number, the same codes either side of it, inside the run.
  // `asked.at > 0` keeps a bare "46" from matching every design in the book.
  if (run.at !== -1 && asked.at !== -1 && !asked.spanned && asked.at > 0) {
    const head = run.segs.slice(0, run.at);
    const tail = run.segs.slice(run.at + (run.spanned ? 2 : 1));
    const askedHead = asked.segs.slice(0, asked.at);
    const askedTail = asked.segs.slice(asked.at + 1);
    if (
      sameSegs(head, askedHead) &&
      // The codes after the run may be left off — the piece is already named.
      isPrefix(askedTail, tail) &&
      asked.from >= run.from &&
      asked.from <= run.to
    ) {
      return { kind: "piece", piece: pieceNo(run, asked.from), n: asked.from };
    }
  }

  // Separators are ignored here, so "snbramf" finds "SN-BR-AMF-…".
  if (flat(sku).includes(flat(q))) return { kind: "design", piece: "", n: null };
  return null;
}

// --- Pieces ------------------------------------------------------------------

export type PieceStatus = "pending" | "production" | "ready" | "stock" | "cancelled";

export const PIECE_STATUSES: { key: PieceStatus; label: string }[] = [
  { key: "pending", label: "Not started" },
  { key: "production", label: "In production" },
  { key: "ready", label: "Ready" },
  { key: "stock", label: "In stock sheet" },
  { key: "cancelled", label: "Cancelled" },
];

export function isPieceStatus(v: unknown): v is PieceStatus {
  return typeof v === "string" && PIECE_STATUSES.some((s) => s.key === v);
}

export function pieceStatusLabel(status: PieceStatus): string {
  return PIECE_STATUSES.find((s) => s.key === status)?.label || status;
}

export type PdPiece = {
  no: string; // the full piece design number
  n: number; // its number within the run
  status: PieceStatus;
  stockNo: string; // filled in once the piece reaches the stock sheet
  note: string;
};

// The piece list always follows the design number: it is derived from the run
// and then re-joined with whatever was already recorded against each piece. So
// correcting a SKU can never leave the number and the pieces disagreeing, and a
// stale browser tab cannot post a piece the design does not cover.
export function reconcilePieces(sku: string, saved: PdPiece[] | undefined): PdPiece[] {
  const run = parseDesignNo(sku);
  const numbers = pieceNumbers(run);
  if (!numbers.length) return [];

  const known = new Map<string, PdPiece>();
  for (const p of saved || []) {
    if (p && typeof p.no === "string") known.set(flat(p.no), p);
  }

  return numbers.map((no, i) => {
    const prev = known.get(flat(no));
    return {
      no,
      n: run.at === -1 ? i + 1 : run.from + i,
      status: isPieceStatus(prev?.status) ? (prev!.status as PieceStatus) : "pending",
      stockNo: typeof prev?.stockNo === "string" ? prev.stockNo : "",
      note: typeof prev?.note === "string" ? prev.note : "",
    };
  });
}

export type PieceSummary = { total: number; inStock: number; started: number; open: number };

export function summarisePieces(pieces: PdPiece[] | undefined): PieceSummary {
  const list = pieces || [];
  const live = list.filter((p) => p.status !== "cancelled");
  return {
    total: list.length,
    inStock: list.filter((p) => p.status === "stock").length,
    started: list.filter((p) => p.status === "production" || p.status === "ready").length,
    open: live.filter((p) => p.status === "pending").length,
  };
}

// --- Building one -------------------------------------------------------------
// A design number is read left to right and every part of it means something:
//
//   SN-BR-TN-5CT      Seyaa N, Bracelet, Tennis, 5 carats total
//   SN-BR-TN-OV-14CT  ... with the stone shape as well
//   SN-BR-AMF-10CT    Bracelet, All Mix Fancy
//
// So it is built rather than typed: the codes come off the category, its
// sub-category and its sub-sub-category, and the weight off the sheet. Nothing
// is invented here — a level with no code contributes nothing.

export const HOUSE_CODE = "SN"; // Seyaa N

// "5" -> "5CT"; "5.5 cts" -> "5.5CT"; "10CT" is already written.
export function caratCode(raw: string): string {
  const t = (raw || "").trim();
  if (!t) return "";
  const n = parseFloat(t.replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) {
    // Not a number: printed as written, tidied, so nothing is silently dropped.
    return t.toUpperCase().replace(/[^A-Z0-9.]/g, "");
  }
  return `${parseFloat(n.toFixed(3))}CT`;
}

export function buildDesignNo(parts: {
  category?: string;
  subCategory?: string;
  subSubCategory?: string;
  tdw?: string;
  house?: string;
}): string {
  const clean = (v?: string) => (v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return [
    clean(parts.house ?? HOUSE_CODE),
    clean(parts.category),
    clean(parts.subCategory),
    clean(parts.subSubCategory),
    caratCode(parts.tdw || ""),
  ]
    .filter(Boolean)
    .join("-");
}
