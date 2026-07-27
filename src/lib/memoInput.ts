// Shared request-body parsing for the create (POST) and edit (PATCH) routes,
// so a gold memo is validated identically whichever way it arrives. Nothing
// here trusts the client: weights, touch and purposes are all re-derived.
import { GOLD_PURPOSES, PURPOSES, fineWeight, normalizeTouch, parseCodes, parseWeight, type MemoKind } from "./memoFormat";
import type { GoldItem, MemoItem } from "./memoStore";

export type ParsedMemo = {
  kind: MemoKind;
  to: string;
  through: string;
  mobile: string;
  date: string;
  purpose: string;
  comment: string;
  items: MemoItem[];
  goldItems: GoldItem[];
  againstMemoNo: string;
};

export function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeItems(raw: unknown): MemoItem[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((it) => {
      const src = it as { type?: unknown; stockNos?: unknown };
      const type = typeof src.type === "string" ? src.type : "";
      // Accept either a pre-split array or a raw string and normalise both.
      const codes = Array.isArray(src.stockNos)
        ? parseCodes(src.stockNos.join(","))
        : parseCodes(String(src.stockNos ?? ""));
      return { type, stockNos: codes };
    })
    .filter((it) => it.type || it.stockNos.length > 0);
}

function normalizeGold(raw: unknown): GoldItem[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((it) => {
      const src = it as { description?: unknown; touch?: unknown; grossWt?: unknown };
      const description = str(src.description);
      const touch = normalizeTouch(src.touch as string | number);
      const grossWt = parseWeight(src.grossWt as string | number);
      // Fine is always recomputed here — never taken from the client.
      return { description, touch, grossWt, fineWt: fineWeight(grossWt, touch) };
    })
    .filter((r) => r.description || r.grossWt > 0);
}

export type ParseResult = { ok: true; value: ParsedMemo } | { ok: false; error: string };

// `kindOverride` is used on edit, where the memo's existing kind wins over
// anything the request claims — a memo can't change books after it's numbered.
export function parseMemoBody(
  body: Record<string, unknown>,
  kindOverride?: MemoKind
): ParseResult {
  const kind: MemoKind = kindOverride ?? (body.kind === "gold" ? "gold" : "jewellery");
  const gold = kind === "gold";

  const items = gold ? [] : normalizeItems(body.items);
  const goldItems = gold ? normalizeGold(body.goldItems) : [];

  if (gold) {
    if (!goldItems.length) {
      return { ok: false, error: "Add at least one gold row with a description or weight." };
    }
    const bad = goldItems.find((r) => !(r.grossWt > 0) || !(r.touch > 0));
    if (bad) {
      return {
        ok: false,
        error: `Every gold row needs a gross weight and a touch (check "${bad.description || "the blank row"}").`,
      };
    }
  } else if (!items.length) {
    return { ok: false, error: "Add at least one item with a type or stock number." };
  }

  const allowed: readonly string[] = gold ? GOLD_PURPOSES : PURPOSES;
  const requested = str(body.purpose);
  const purpose = allowed.includes(requested) ? requested : allowed[0];

  return {
    ok: true,
    value: {
      kind,
      to: str(body.to),
      through: str(body.through),
      mobile: str(body.mobile),
      date: str(body.date),
      purpose,
      comment: str(body.comment),
      items,
      goldItems,
      // Only a Receipt settles against an earlier Issue.
      againstMemoNo: gold && /receipt/i.test(purpose) ? str(body.againstMemoNo) : "",
    },
  };
}
