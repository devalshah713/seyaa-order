// Persistent memo store, against whichever store is configured.
//
// It began as one JSON document: a running counter per fiscal year and every
// memo, event, order and list, read whole and written whole, with nothing
// cached in between, so a memo saved a second ago is visible to the next person
// who looks. That is still here, unchanged, and it is still what runs until the
// owner has made the database.
//
// Why there is now a second way: on Cloudflare's free plan a request is allowed
// ten milliseconds of processor time, and writing the whole document costs the
// size of the whole document. Measured, saving one memo took 14 milliseconds
// with 200 memos in the book and 26 with 400. Nothing was being wasted; the
// cost was the document. In Cloudflare D1, which is free, a save is one row.
//
// --- Which store is used ---------------------------------------------------
//
// D1, if and only if the database is attached to the Worker AND the records
// have been copied into it. Otherwise the JSON document in R2, exactly as
// before. There is no third state and no half-way: the copy sets one flag when
// every record is across, and that flag is the switch.
//
// So this can be deployed before the database exists, and the database can be
// filled before or after the deploy. Neither order leaves a window where the
// memo book reads as empty, which matters because every screen in the JSON era
// reads, changes and writes whole: a store misread as empty would put a blank
// document back over a full one.
//
// Nothing is ever deleted from R2. After the switch the R2 document stays as it
// was on the day of the move, which is a complete readable copy of the business
// up to that moment.
//
// --- Numbering --------------------------------------------------------------
//
// Numbering is authoritative on the server either way. Against the document,
// createMemo() reads it, takes the next serial for the memo's fiscal year, and
// writes it back; for a single-office workflow that read-modify-write is safe
// enough, and two memos saved in the very same instant have the second retry
// onto a fresh read. Against D1 the number is taken by the database inside the
// same transaction that writes the memo, which is both stricter and cheaper.
// See takeNextNumber() in memoSql.ts.
import "server-only";
import { isDbConfigured, readDoc, writeDoc } from "./db";
import { randomUUID } from "node:crypto";
import { hasSql } from "./sql";
import { memosAreInSql } from "./sqlSchema";
import {
  numberTemplate,
  sqlAddEvents,
  sqlAddParties,
  sqlAllParties,
  sqlCounter,
  sqlCounters,
  sqlCreateMemo,
  sqlCreateOrder,
  sqlDeleteMemo,
  sqlDeleteOrder,
  sqlDeleteParties,
  sqlEventsForStock,
  sqlEventsForStockNos,
  sqlFlags,
  sqlGetMemo,
  sqlGetMemoWithEvents,
  sqlGetOrder,
  sqlListEvents,
  sqlListMemoHistory,
  sqlListMemos,
  sqlListOpenIssues,
  sqlListOrders,
  sqlMemoItems,
  sqlMemosWithItems,
  sqlMemosWithStockNos,
  sqlPutMemo,
  sqlPutOrder,
  sqlPutParty,
  sqlRecipientCounts,
  sqlReplaceRecipient,
  sqlSetFlag,
  type MemoStockRow,
} from "./memoSql";
import {
  counterKey,
  fyFromInput,
  linesFor,
  memoIdForKind,
  memoNoForKind,
  orderIdFor,
  orderNoFor,
  partyKey,
  stockKey,
  todayInput,
  type MemoKind,
  type OrderComment,
  type OrderStatus,
  type Party,
  type StockEvent,
  type StockOutcome,
  SEED_LISTS,
  closestName,
  hasCode,
  normalizeCode,
  suggestCode,
  partyKindOf,
  parentKindOf,
  type PartyKind,
} from "./memoFormat";

const DB_PATH = "memos/db.json";

export type MemoItem = { type: string; stockNos: string[] };

// A row on a gold memo: what was sent, at what purity, and how much of it.
// fineWt is derived (gross x touch) but stored so a saved memo always prints
// exactly the figures it was signed with.
export type GoldItem = {
  description: string;
  touch: number; // percentage, e.g. 91.60
  grossWt: number; // grams
  fineWt: number; // grams
};

export type Memo = {
  id: string; // URL-safe, e.g. "SS-26-27-001" or "SG-26-27-001"
  memoNo: string; // printed, e.g. "SS/26-27/001" or "SG/26-27/001"
  kind: MemoKind; // memos saved before gold existed are read as "jewellery"
  fy: string;
  seq: number;
  to: string;
  through: string;
  mobile: string;
  date: string; // yyyy-mm-dd
  purpose: string;
  comment: string;
  items: MemoItem[]; // jewellery rows (empty on a gold memo)
  goldItems: GoldItem[]; // gold rows (empty on a jewellery memo)
  againstMemoNo?: string; // on a Receipt: the Issue memo it settles
  totalPcs: number;
  totalGrossWt: number;
  totalFineWt: number;
  createdAt: string; // ISO
  updatedAt?: string; // ISO — set on create and every edit; drives incremental backup
};

export type NewMemo = Omit<
  Memo,
  "id" | "memoNo" | "fy" | "seq" | "totalPcs" | "totalGrossWt" | "totalFineWt" | "createdAt"
>;

export type { StockEvent, StockOutcome } from "./memoFormat";

// An order taken over WhatsApp: something still being made, as opposed to a
// memo, which moves stock that already exists.
export type Order = {
  id: string;
  orderNo: string;
  fy: string;
  seq: number;
  customer: string;
  productName: string;
  goldColor: string;
  diamondCts: number; // total carat weight
  pcs: number;
  stockNo?: string; // set when an existing piece is being remade
  status: OrderStatus;
  comments: OrderComment[];
  createdAt: string;
  updatedAt?: string;
};

export type NewOrder = Omit<Order, "id" | "orderNo" | "fy" | "seq" | "createdAt" | "comments">;

export type DB = {
  counters: Record<string, number>;
  memos: Memo[];
  events: StockEvent[];
  orders: Order[];
  parties: Party[];
  // Set once a list's built-in names have been written in, so removing one does
  // not bring it back on the next read. `mfgSeeded` is the first version of
  // this, kept so a store written by it is not seeded twice.
  mfgSeeded?: boolean;
  seeded?: Partial<Record<PartyKind, boolean>>;
};

export function isStorageConfigured(): boolean {
  return isDbConfigured();
}

// Is D1 the live store for memos?
//
// Both halves have to be true: the database has to be attached, and the records
// have to be in it. Asked once per call rather than cached across calls,
// because the day the copy runs is a day when the answer changes without a
// deploy.
async function useSql(): Promise<boolean> {
  return hasSql() && (await memosAreInSql());
}

// --- The JSON document ------------------------------------------------------

async function readDB(): Promise<DB> {
  const db = await readDoc<Partial<DB>>(DB_PATH, {});
  return {
    counters: db.counters || {},
    memos: (db.memos || []).map(normalize),
    events: db.events || [],
    orders: db.orders || [],
    parties: db.parties || [],
  };
}

// The document as it really is, flags and all. readDB() drops the seeding
// flags, which is harmless where it is used but would lose them on the way
// across, so the copy reads the document through this instead.
export async function readMemoDoc(): Promise<Partial<DB>> {
  return readDoc<Partial<DB>>(DB_PATH, {});
}

async function writeDB(db: DB): Promise<void> {
  await writeDoc(DB_PATH, db);
}

function totalOf(items: MemoItem[]): number {
  return items.reduce((n, it) => n + it.stockNos.length, 0);
}

function sumBy(rows: GoldItem[], pick: (r: GoldItem) => number): number {
  // Weights add in milligrams to avoid float drift across many rows.
  return Math.round(rows.reduce((n, r) => n + (pick(r) || 0), 0) * 1000) / 1000;
}

// Memos written before gold memos existed have no kind and no gold fields.
// Fill them in on read so the rest of the app never has to special-case age.
function normalize(m: Memo): Memo {
  return {
    ...m,
    kind: m.kind === "gold" ? "gold" : "jewellery",
    items: m.items || [],
    goldItems: m.goldItems || [],
    totalPcs: m.totalPcs || 0,
    totalGrossWt: m.totalGrossWt || 0,
    totalFineWt: m.totalFineWt || 0,
  };
}

// The same reading, for the copy: a memo goes into D1 already filled in, so the
// columns and the stored record agree and neither needs special-casing again.
export const normalizeMemo = normalize;

// --- Saving a memo ----------------------------------------------------------

// The memo itself, with everything worked out except where it is stored. The
// number is passed in, because the two stores decide it differently: the
// document takes it from the counters it has just read, D1 takes it inside the
// transaction that writes the row.
function memoFrom(input: NewMemo, kind: MemoKind, fy: string, seq: number, date: string): Memo {
  const items = kind === "gold" ? [] : input.items || [];
  const goldItems = kind === "gold" ? input.goldItems || [] : [];
  const now = new Date().toISOString();

  return {
    id: memoIdForKind(kind, fy, seq),
    memoNo: memoNoForKind(kind, fy, seq),
    kind,
    fy,
    seq,
    to: input.to,
    through: input.through,
    mobile: input.mobile,
    date,
    purpose: input.purpose,
    comment: input.comment,
    items,
    goldItems,
    againstMemoNo: input.againstMemoNo || undefined,
    totalPcs: totalOf(items),
    totalGrossWt: sumBy(goldItems, (r) => r.grossWt),
    totalFineWt: sumBy(goldItems, (r) => r.fineWt),
    createdAt: now,
    updatedAt: now,
  };
}

// What a memo's number looks like for this book, as a pattern the database
// fills in. Derived from memoFormat so the format is written down once.
function memoTemplates(kind: MemoKind, fy: string) {
  return {
    id: numberTemplate((seq) => memoIdForKind(kind, fy, seq)),
    no: numberTemplate((seq) => memoNoForKind(kind, fy, seq)),
  };
}

// One row, in one transaction with the number it is issued under.
async function createMemoSql(input: NewMemo): Promise<Memo> {
  const date = input.date || todayInput();
  const fy = fyFromInput(date);
  const kind: MemoKind = input.kind === "gold" ? "gold" : "jewellery";
  // Built with serial 0; the database replaces it, and the memo that comes back
  // is the row that was actually stored.
  const memo = memoFrom(input, kind, fy, 0, date);
  return sqlCreateMemo(memo, counterKey(kind, fy), memoTemplates(kind, fy));
}

export async function createMemo(input: NewMemo): Promise<Memo> {
  if (await useSql()) return createMemoSql(input);

  const db = await readDB();
  const memo = createMemoIn(db, input);
  await writeDB(db);
  return memo;
}

// Saving a memo, from one read of the store.
//
// The party check and the create each used to read the whole document for
// themselves, so saving parsed it twice and then wrote it back. Measured on a
// few hundred memos that was about 37 milliseconds, and a request is allowed
// ten. This does both against one reading.
//
// On D1 it is the party list and then one transaction: two statements, nothing
// read that is not needed, and the whole memo book never touched.
//
// It answers rather than throws when the party is wrong, because that is the
// person's mistake to correct and deserves its own message, not a failure.
export async function saveMemo(
  input: NewMemo
): Promise<{ ok: true; memo: Memo } | { ok: false; error: string }> {
  if (await useSql()) {
    const party = resolvePartyIn(await sqlAllParties(), input.to);
    if (!party.ok) return party;
    return { ok: true, memo: await createMemoSql({ ...input, to: party.name }) };
  }

  const db = await readDB();

  const party = resolvePartyIn(db.parties, input.to);
  if (!party.ok) return party;

  const memo = createMemoIn(db, { ...input, to: party.name });
  await writeDB(db);
  return { ok: true, memo };
}

// The memo itself, added to a database already in hand. The caller writes.
function createMemoIn(db: DB, input: NewMemo): Memo {
  const date = input.date || todayInput();
  const fy = fyFromInput(date);
  const kind: MemoKind = input.kind === "gold" ? "gold" : "jewellery";
  const key = counterKey(kind, fy);
  const seq = (db.counters[key] || 0) + 1;
  db.counters[key] = seq;

  const memo = memoFrom(input, kind, fy, seq, date);
  db.memos.push(memo);
  return memo;
}

// Next serial for a given date's fiscal year — for the live form preview only.
export async function peekNextMemoNo(dateInput: string, kind: MemoKind = "jewellery"): Promise<string> {
  const fy = fyFromInput(dateInput || todayInput());
  const key = counterKey(kind, fy);
  if (await useSql()) return memoNoForKind(kind, fy, (await sqlCounter(key)) + 1);

  const db = await readDB();
  return memoNoForKind(kind, fy, (db.counters[key] || 0) + 1);
}

// Issue memos a Receipt can be booked against, newest first.
export async function listOpenIssues(): Promise<{ memoNo: string; to: string; date: string }[]> {
  if (await useSql()) return sqlListOpenIssues();

  const db = await readDB();
  return db.memos
    .filter((m) => m.kind === "gold" && m.purpose === "Issue to Factory")
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .map((m) => ({ memoNo: m.memoNo, to: m.to, date: m.date }));
}

export async function listMemos(): Promise<Memo[]> {
  if (await useSql()) return (await sqlListMemos()).map(normalize);

  const db = await readDB();
  // Newest first.
  return db.memos.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Both lists the memo history needs, from one read of the store instead of one
// read per list. The per-list processing is the same as listMemos() and
// listEvents() do on their own: memos normalised by readDB() then newest
// first, events exactly as stored.
//
// This is the page the office keeps open, and the one that cost the most. On D1
// it is two queries, and the memos come back as the columns the table shows
// rather than as whole records, so no memo is parsed to draw a row.
export async function listMemoHistory(): Promise<{ memos: Memo[]; events: StockEvent[] }> {
  if (await useSql()) return sqlListMemoHistory();

  const db = await readDB();
  return {
    // Newest first.
    memos: db.memos.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    events: db.events,
  };
}

export async function getMemo(id: string): Promise<Memo | null> {
  if (await useSql()) {
    const memo = await sqlGetMemo(id);
    return memo ? normalize(memo) : null;
  }

  const db = await readDB();
  return db.memos.find((m) => m.id === id) || null;
}

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

// The flags that say a built-in list has already been written in. Read once per
// Worker and kept, because a list cannot become unseeded.
let flagCache: Record<string, number> | null = null;

async function flags(): Promise<Record<string, number>> {
  if (!flagCache) flagCache = await sqlFlags();
  return flagCache;
}

function seedFlag(kind: PartyKind): string {
  return `seeded:${kind}`;
}

function isSeeded(known: Record<string, number>, kind: PartyKind): boolean {
  // mfgSeeded is the flag the first version of this used, carried across by the
  // copy so a manufacturer list that was cleared before the move stays cleared.
  return !!known[seedFlag(kind)] || (kind === "mfg" && !!known.mfgSeeded);
}

async function markSeeded(kind: PartyKind): Promise<void> {
  await sqlSetFlag(seedFlag(kind));
  if (flagCache) flagCache[seedFlag(kind)] = 1;
}

// Every list, with any built-in names written in first. One query for all the
// lists rather than one per list, because several screens want more than one
// and the lists together are a few hundred rows.
async function sqlPartiesSeeded(kinds: PartyKind[]): Promise<Party[]> {
  const known = await flags();
  const pending = kinds.filter((kind) => SEED_LISTS[kind] && !isSeeded(known, kind));
  const parties = await sqlAllParties();
  if (pending.length === 0) return parties;

  const now = new Date().toISOString();
  const added: Party[] = [];
  for (const kind of pending) {
    for (const name of SEED_LISTS[kind] || []) {
      const clash = [...parties, ...added].some(
        (p) => partyKindOf(p) === kind && partyKey(p.name) === partyKey(name)
      );
      if (clash) continue;
      added.push({ id: randomUUID(), name, kind, createdAt: now, createdBy: "system" });
    }
  }
  if (added.length) await sqlAddParties(added);
  for (const kind of pending) await markSeeded(kind);
  return [...parties, ...added];
}

export async function listParties(kind: PartyKind = "party"): Promise<Party[]> {
  if (await useSql()) {
    return (await sqlPartiesSeeded([kind]))
      .filter((p) => partyKindOf(p) === kind)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  let db = await readDB();
  if (await seedList(db, kind)) db = await readDB();
  return db.parties
    .filter((p) => partyKindOf(p) === kind)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Several lists at once, for a screen that needs more than one — one read of
// the store instead of one per list.
export type ListEntry = { name: string; parent: string; code: string };

export async function listPartyNames(
  kinds: PartyKind[]
): Promise<Record<string, ListEntry[]>> {
  let parties: Party[];
  if (await useSql()) {
    parties = await sqlPartiesSeeded(kinds);
  } else {
    let db = await readDB();
    let wrote = false;
    for (const kind of kinds) wrote = (await seedList(db, kind)) || wrote;
    if (wrote) db = await readDB();
    parties = db.parties;
  }

  // The parent goes out by name, not id: a form holds what was chosen, not the
  // row it came from, so the name is what it can filter on.
  const nameById = new Map(parties.map((p) => [p.id, p.name]));
  const out: Record<string, ListEntry[]> = {};
  for (const kind of kinds) {
    out[kind] = parties
      .filter((p) => partyKindOf(p) === kind)
      .map((p) => ({
        name: p.name,
        parent: (p.parentId && nameById.get(p.parentId)) || "",
        code: p.code || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

// Writes a list's built-in names in, once. Returns whether it wrote.
async function seedList(db: DB, kind: PartyKind): Promise<boolean> {
  const seed = SEED_LISTS[kind];
  if (!seed) return false;
  // mfgSeeded is the flag the first version of this used.
  if (db.seeded?.[kind] || (kind === "mfg" && db.mfgSeeded)) return false;

  const now = new Date().toISOString();
  for (const name of seed) {
    const clash = db.parties.some(
      (p) => partyKindOf(p) === kind && partyKey(p.name) === partyKey(name)
    );
    if (clash) continue;
    db.parties.push({
      id: randomUUID(), name, kind, createdAt: now, createdBy: "system",
    });
  }
  db.seeded = { ...db.seeded, [kind]: true };
  if (kind === "mfg") db.mfgSeeded = true;
  await writeDB(db);
  return true;
}

// Empties a list. Also marks it seeded, so a list whose built-in names were
// just cleared out does not have them written back on the next read.
export async function clearParties(kind: PartyKind): Promise<number> {
  if (await useSql()) {
    const parties = await sqlAllParties();
    const gone = new Set(parties.filter((p) => partyKindOf(p) === kind).map((p) => p.id));
    // Everything under them goes too, because a sub-category with no category
    // above it can never be offered again.
    const doomed = parties
      .filter((p) => gone.has(p.id) || (p.parentId && gone.has(p.parentId)))
      .map((p) => p.id);
    const removed = await sqlDeleteParties(doomed);
    await markSeeded(kind);
    return removed;
  }

  const db = await readDB();
  const before = db.parties.length;
  const gone = new Set(
    db.parties.filter((p) => partyKindOf(p) === kind).map((p) => p.id)
  );
  // Everything under them goes too — a sub-category with no category above it
  // can never be offered again.
  db.parties = db.parties.filter(
    (p) => partyKindOf(p) !== kind && !(p.parentId && gone.has(p.parentId))
  );
  db.seeded = { ...db.seeded, [kind]: true };
  if (kind === "mfg") db.mfgSeeded = true;
  await writeDB(db);
  return before - db.parties.length;
}

// The checks a new name has to pass, against the list as it stands. The same
// reasoning either way; only where the list came from differs.
function checkNewParty(
  parties: Party[],
  clean: string,
  kind: PartyKind,
  parentId: string
): { ok: false; error: string } | { ok: true } {
  // A list that hangs off another needs to know what it hangs off, or nothing
  // can ever offer it.
  const needsParent = !!parentKindOf(kind);
  if (needsParent && !parentId) {
    return { ok: false, error: "Choose what this sits under." };
  }
  if (parentId && !parties.some((p) => p.id === parentId)) {
    return { ok: false, error: "That parent is no longer on the list." };
  }

  // Names collide only within their own list, and within a tree only under the
  // same parent: "Oval" under two different sub-categories is two real things.
  const existing = parties.find(
    (p) =>
      partyKindOf(p) === kind &&
      (p.parentId || "") === (parentId || "") &&
      partyKey(p.name) === partyKey(clean)
  );
  if (existing) {
    return { ok: false, error: `Already on the list as "${existing.name}".` };
  }
  return { ok: true };
}

export async function createParty(
  name: string,
  by: string,
  kind: PartyKind = "party",
  parentId = "",
  code = ""
): Promise<{ ok: true; party: Party } | { ok: false; error: string }> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2) return { ok: false, error: "Give the party a name." };

  const build = (): Party => ({
    id: randomUUID(),
    name: clean,
    kind,
    ...(parentId ? { parentId } : {}),
    ...(hasCode(kind) ? { code: normalizeCode(code) || suggestCode(clean) } : {}),
    createdAt: new Date().toISOString(),
    createdBy: by,
  });

  if (await useSql()) {
    const check = checkNewParty(await sqlAllParties(), clean, kind, parentId);
    if (!check.ok) return check;
    const party = build();
    await sqlPutParty(party);
    return { ok: true, party };
  }

  const db = await readDB();
  const check = checkNewParty(db.parties, clean, kind, parentId);
  if (!check.ok) return check;

  const party = build();
  db.parties.push(party);
  await writeDB(db);
  return { ok: true, party };
}

export async function renameParty(
  id: string,
  name: string,
  code?: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2) return { ok: false, error: "Give the party a name." };

  // Renaming to a name the same list already holds, under the same parent, is
  // the one thing to refuse.
  const clashIn = (parties: Party[], party: Party): string => {
    const kind = partyKindOf(party);
    const clash = parties.find(
      (p) =>
        p.id !== id &&
        partyKindOf(p) === kind &&
        (p.parentId || "") === (party.parentId || "") &&
        partyKey(p.name) === partyKey(clean)
    );
    return clash ? clash.name : "";
  };

  if (await useSql()) {
    const parties = await sqlAllParties();
    const party = parties.find((p) => p.id === id);
    if (!party) return { ok: false, error: "Party not found." };
    const clash = clashIn(parties, party);
    if (clash) return { ok: false, error: `Already on the list as "${clash}".` };

    const kind = partyKindOf(party);
    party.name = clean;
    // Only the coded lists carry one, and an emptied box falls back to the
    // suggestion rather than leaving a design number a piece short.
    if (hasCode(kind)) party.code = normalizeCode(code || "") || suggestCode(clean);
    await sqlPutParty(party);
    return { ok: true };
  }

  const db = await readDB();
  const party = db.parties.find((p) => p.id === id);
  if (!party) return { ok: false, error: "Party not found." };

  const kind = partyKindOf(party);
  const clash = clashIn(db.parties, party);
  if (clash) return { ok: false, error: `Already on the list as "${clash}".` };

  party.name = clean;
  // Only the coded lists carry one, and an emptied box falls back to the
  // suggestion rather than leaving a design number a piece short.
  if (hasCode(kind)) party.code = normalizeCode(code || "") || suggestCode(clean);
  await writeDB(db);
  return { ok: true };
}

// Everything that would go with this entry: itself, and anything hanging off
// it however deep. A sub-sub-category whose sub-category is gone can never be
// reached, and left behind it would reappear the day something with the old id
// is added.
function doomedWith(parties: Party[], id: string): string[] {
  const doomed = new Set([id]);
  for (let pass = 0; pass < 4; pass++) {
    for (const p of parties) {
      if (p.parentId && doomed.has(p.parentId)) doomed.add(p.id);
    }
  }
  return [...doomed];
}

function partyInUseError(party: Party, used: number): string {
  return `${party.name} is on ${used} memo${used === 1 ? "" : "s"} and cannot be removed. Rename it instead.`;
}

export async function deleteParty(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await useSql()) {
    const parties = await sqlAllParties();
    const party = parties.find((p) => p.id === id);
    if (!party) return { ok: false, error: "Party not found." };

    // A party named on an existing memo stays on the list, because removing it
    // would leave that memo pointing at something the list no longer knows
    // about. Only memo parties can be on a memo; a category never is.
    if (partyKindOf(party) === "party") {
      // The recipients and their counts, not the memos: this is a question
      // about one word on each memo, and matching ignores case and
      // punctuation, which no index can do.
      const used = (await sqlRecipientCounts())
        .filter((row) => partyKey(row.to) === partyKey(party.name))
        .reduce((n, row) => n + row.memos, 0);
      if (used > 0) return { ok: false, error: partyInUseError(party, used) };
    }

    await sqlDeleteParties(doomedWith(parties, id));
    return { ok: true };
  }

  const db = await readDB();
  const party = db.parties.find((p) => p.id === id);
  if (!party) return { ok: false, error: "Party not found." };

  const used = partyKindOf(party) !== "party"
    ? 0
    : db.memos.filter((m) => partyKey(m.to) === partyKey(party.name)).length;
  if (used > 0) return { ok: false, error: partyInUseError(party, used) };

  const doomed = new Set(doomedWith(db.parties, id));
  db.parties = db.parties.filter((p) => !doomed.has(p.id));
  await writeDB(db);
  return { ok: true };
}

// Gate for saving a memo. Matching ignores case and punctuation, and the
// stored value is snapped to the list's spelling, so a memo can never record a
// variant of a name that is already on the list.
export async function resolveParty(
  name: string
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  if (await useSql()) return resolvePartyIn(await sqlAllParties(), name);
  return resolvePartyIn((await readDB()).parties, name);
}

// The same check against a list already in hand, so a caller that has read the
// store does not read it a second time to ask this.
function resolvePartyIn(
  parties: Party[],
  name: string
): { ok: true; name: string } | { ok: false; error: string } {
  // An empty list means the feature has not been set up yet; refusing every
  // memo until an admin adds a party would stop the business dead.
  if (parties.length === 0) return { ok: true, name: name.trim() };

  const match = parties.find((p) => partyKey(p.name) === partyKey(name));
  if (!match) {
    return {
      ok: false,
      error: `"${name.trim()}" is not on the party list. Pick an existing party, or ask an admin to add it.`,
    };
  }
  return { ok: true, name: match.name };
}

// Distinct party names already written on memos that are not on the list —
// what the free-text era left behind, so an admin can see the variants and
// add the correct spelling of each.
export type UnlistedName = {
  name: string;
  memos: number;
  // The listed party this was probably meant to be, worked out from the name
  // itself. Null when nothing is close enough to put in front of someone.
  match: string;
  score: number;
};

export async function unlistedPartyNames(): Promise<UnlistedName[]> {
  const sql = await useSql();
  const db = sql ? null : await readDB();
  const allParties = sql ? await sqlAllParties() : db!.parties;
  const parties = allParties.filter((p) => partyKindOf(p) === "party");
  const known = new Set(parties.map((p) => partyKey(p.name)));
  const listed = parties.map((p) => p.name);

  // Who memos went to, and how many each. On D1 that is a count by recipient
  // rather than every memo: the question is about one word on each.
  const recipients = sql
    ? await sqlRecipientCounts()
    : db!.memos.map((m) => ({ to: m.to, memos: 1 }));

  const counts = new Map<string, { name: string; memos: number }>();
  for (const row of recipients) {
    const key = partyKey(row.to);
    if (!key || known.has(key)) continue;
    const prev = counts.get(key);
    counts.set(key, { name: prev?.name || row.to, memos: (prev?.memos || 0) + row.memos });
  }

  return [...counts.values()]
    .map((u) => {
      const best = closestName(u.name, listed);
      return { ...u, match: best?.name || "", score: best?.score || 0 };
    })
    .sort((a, b) => b.score - a.score || b.memos - a.memos);
}

// Puts every memo carrying a typed name onto a name from the list. This is the
// only way an old memo's recipient changes: the memo form has not accepted a
// typed name since the list came in.
export async function replacePartyOnMemos(
  from: string,
  to: string
): Promise<{ ok: true; memos: number } | { ok: false; error: string }> {
  const fromKey = partyKey(from);
  if (!fromKey) return { ok: false, error: "Nothing to replace." };

  if (await useSql()) {
    const target = (await sqlAllParties()).find(
      (p) => partyKindOf(p) === "party" && partyKey(p.name) === partyKey(to)
    );
    if (!target) return { ok: false, error: `${to} is not on the party list.` };

    // Every spelling on a memo that means this party. Worked out here because
    // the comparison ignores case and punctuation, which SQL cannot.
    const spellings = (await sqlRecipientCounts())
      .map((row) => row.to)
      .filter((name) => partyKey(name) === fromKey);

    // One statement, however many memos. The memo's paper says something
    // different now, so updatedAt moves and the nightly backup fetches its PDF
    // again rather than keeping the old one.
    const changed = await sqlReplaceRecipient(spellings, target.name, new Date().toISOString());
    if (!changed) return { ok: false, error: `No memos are under "${from}".` };
    return { ok: true, memos: changed };
  }

  const db = await readDB();
  const target = db.parties.find(
    (p) => partyKindOf(p) === "party" && partyKey(p.name) === partyKey(to)
  );
  if (!target) return { ok: false, error: `${to} is not on the party list.` };

  const now = new Date().toISOString();
  let changed = 0;
  for (const m of db.memos) {
    if (partyKey(m.to) !== fromKey) continue;
    m.to = target.name; // the list's spelling, not the one typed that day
    // The memo's paper says something different now, so the nightly backup
    // fetches its PDF again rather than keeping the old one.
    m.updatedAt = now;
    changed++;
  }
  if (!changed) return { ok: false, error: `No memos are under "${from}".` };
  await writeDB(db);
  return { ok: true, memos: changed };
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function listOrders(): Promise<Order[]> {
  const orders = (await useSql()) ? await sqlListOrders() : (await readDB()).orders;
  return orders
    .map((o) => ({ ...o, comments: o.comments || [] })) // orders saved before comments existed
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// Notes are only ever added. Editing an order does not touch them, so the
// history of what was said about a piece survives any later correction.
export async function addOrderComment(
  id: string,
  text: string,
  by: string
): Promise<Order | null> {
  const note: OrderComment = { id: randomUUID(), text, at: new Date().toISOString(), by };

  if (await useSql()) {
    const order = await sqlGetOrder(id);
    if (!order) return null;
    const updated = { ...order, comments: [...(order.comments || []), note] };
    await sqlPutOrder(updated);
    return updated;
  }

  const db = await readDB();
  const i = db.orders.findIndex((o) => o.id === id);
  if (i === -1) return null;

  const comments = db.orders[i].comments || [];
  comments.push(note);
  db.orders[i] = { ...db.orders[i], comments };
  await writeDB(db);
  return db.orders[i];
}

// `firstNote` lets an order be created with its opening comment in one write,
// so a note typed on the add form is saved atomically with the order itself
// rather than as a second call that could fail on its own.
export async function createOrder(
  input: NewOrder,
  firstNote?: { text: string; by: string }
): Promise<Order> {
  const fy = fyFromInput(todayInput());
  const key = `O:${fy}`;
  const now = new Date().toISOString();

  const build = (seq: number): Order => ({
    id: orderIdFor(fy, seq),
    orderNo: orderNoFor(fy, seq),
    fy,
    seq,
    customer: input.customer,
    productName: input.productName,
    goldColor: input.goldColor,
    diamondCts: input.diamondCts,
    pcs: input.pcs,
    stockNo: input.stockNo || undefined,
    status: input.status,
    comments: firstNote?.text
      ? [{ id: randomUUID(), text: firstNote.text, at: now, by: firstNote.by }]
      : [],
    createdAt: now,
    updatedAt: now,
  });

  if (await useSql()) {
    // Serial 0 as a placeholder; the database takes the real one inside the
    // transaction that writes the row, exactly as a memo does.
    return sqlCreateOrder(build(0), key, {
      id: numberTemplate((seq) => orderIdFor(fy, seq)),
      no: numberTemplate((seq) => orderNoFor(fy, seq)),
    });
  }

  const db = await readDB();
  const seq = (db.counters[key] || 0) + 1;
  db.counters[key] = seq;
  const order = build(seq);
  db.orders.push(order);
  await writeDB(db);
  return order;
}

function orderWith(order: Order, patch: Partial<NewOrder>): Order {
  return {
    ...order,
    ...patch,
    stockNo: (patch.stockNo ?? order.stockNo) || undefined,
    // An edit changes the order's details, never its notes.
    comments: order.comments || [],
    updatedAt: new Date().toISOString(),
  };
}

export async function updateOrder(
  id: string,
  patch: Partial<NewOrder>
): Promise<Order | null> {
  if (await useSql()) {
    const order = await sqlGetOrder(id);
    if (!order) return null;
    const updated = orderWith(order, patch);
    await sqlPutOrder(updated);
    return updated;
  }

  const db = await readDB();
  const i = db.orders.findIndex((o) => o.id === id);
  if (i === -1) return null;
  db.orders[i] = orderWith(db.orders[i], patch);
  await writeDB(db);
  return db.orders[i];
}

export async function deleteOrder(id: string): Promise<boolean> {
  if (await useSql()) return sqlDeleteOrder(id);

  const db = await readDB();
  const before = db.orders.length;
  db.orders = db.orders.filter((o) => o.id !== id);
  if (db.orders.length === before) return false;
  await writeDB(db);
  return true;
}

export async function listEvents(): Promise<StockEvent[]> {
  if (await useSql()) return sqlListEvents();
  return (await readDB()).events;
}

export async function getMemoWithEvents(
  id: string
): Promise<{ memo: Memo; events: StockEvent[] } | null> {
  if (await useSql()) {
    const found = await sqlGetMemoWithEvents(id);
    return found ? { memo: normalize(found.memo), events: found.events } : null;
  }

  const db = await readDB();
  const memo = db.memos.find((m) => m.id === id);
  if (!memo) return null;
  return { memo, events: db.events.filter((e) => e.memoId === id) };
}

export type NewStockEvent = {
  stockNo: string;
  outcome: StockOutcome;
  replacedBy?: string;
  note?: string;
  onDate?: string; // yyyy-mm-dd
};

// Append outcomes for one memo. Nothing is overwritten: recording the same
// stock number twice leaves both entries, and the later one becomes current.
export async function recordStockEvents(
  memoId: string,
  entries: NewStockEvent[],
  by: string
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  // What the outcomes are checked against: the stock numbers actually on the
  // memo, and its printed number for the message. On D1 that is two columns of
  // one row; on the document it is the whole document, which the write below
  // needs in hand anyway.
  const sql = await useSql();
  const db = sql ? null : await readDB();
  const memo = sql
    ? await sqlMemoItems(memoId)
    : db!.memos.find((m) => m.id === memoId) || null;
  if (!memo) return { ok: false, error: "Memo not found." };

  const onMemo = new Set(memo.items.flatMap((it) => it.stockNos));
  const at = new Date().toISOString();
  const events: StockEvent[] = [];

  for (const e of entries) {
    if (!onMemo.has(e.stockNo)) {
      return { ok: false, error: `${e.stockNo} is not on memo ${memo.memoNo}.` };
    }
    if (e.outcome === "exchanged" && !e.replacedBy) {
      return { ok: false, error: `Give the replacement stock number for ${e.stockNo}.` };
    }
    events.push({
      id: randomUUID(),
      memoId,
      memoNo: memo.memoNo,
      stockNo: e.stockNo,
      outcome: e.outcome,
      replacedBy: e.replacedBy || undefined,
      note: e.note || undefined,
      onDate: e.onDate || at.slice(0, 10),
      at,
      by,
    });
  }

  if (sql) {
    // One statement however many pieces were settled at once.
    await sqlAddEvents(events);
  } else {
    db!.events.push(...events);
    await writeDB(db!);
  }
  return { ok: true, added: entries.length };
}

export type LedgerEntry = {
  memoId: string;
  memoNo: string;
  kind: MemoKind;
  to: string;
  date: string;
  type: string;
  outcome: StockOutcome | null;
  event?: StockEvent;
};

// Everywhere a stock number has been: every memo it went out on, newest first,
// with what became of it each time.
export async function stockHistory(stockNo: string): Promise<LedgerEntry[]> {
  const wanted = stockNo.trim().toUpperCase();
  const sql = await useSql();

  // On D1 only the memos that can mention this piece and only this piece's
  // outcomes. On the document there is nothing to narrow: it is all one read.
  const db = sql ? null : await readDB();
  const memos = sql ? await sqlMemosWithItems(wanted) : db!.memos;
  const events = sql ? await sqlEventsForStock(wanted) : db!.events;

  const out: LedgerEntry[] = [];
  for (const m of memos) {
    const line = linesFor(m.id, m.items, events).find((l) => l.stockNo === wanted);
    if (!line) continue;
    out.push({
      memoId: m.id,
      memoNo: m.memoNo,
      kind: m.kind,
      to: m.to,
      date: m.date,
      type: line.type,
      outcome: line.outcome,
      event: line.event,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// --- Several stock numbers at once, for the audit ----------------------------

// One memo a piece went out on, and what became of it that time.
export type MemoStockFinding = {
  memoId: string;
  memoNo: string;
  kind: MemoKind;
  to: string;
  date: string;
  purpose: string;
  type: string; // the item type it was listed under
  // The number as the memo spells it, so a finding is never passed off as
  // having been written the way it was asked for.
  storedNo: string;
  outcome: StockOutcome | null;
  event?: StockEvent;
};

// Every memo each of these stock numbers went out on, newest first.
//
// stockHistory() answers this for one number, and a report on fifty numbers
// must not be fifty of those: the narrowing is done once for the whole list.
// What is not done a second time is the reading — the standing of a piece on a
// memo is linesFor()'s answer, latest event wins, which is what the ledger and
// the memo page show.
export async function memosForStockNos(
  keys: string[]
): Promise<Map<string, MemoStockFinding[]>> {
  const out = new Map<string, MemoStockFinding[]>();
  if (keys.length === 0) return out;
  const wanted = new Set(keys);

  const sql = await useSql();
  // On D1 only the memos that can mention one of these pieces and only these
  // pieces' outcomes. On the document there is nothing to narrow in the store:
  // it is one read, and the narrowing happens here.
  const db = sql ? null : await readDB();
  const memos: MemoStockRow[] = sql
    ? await sqlMemosWithStockNos(keys)
    : db!.memos
        .filter((m) =>
          (m.items || []).some((it) =>
            (it.stockNos || []).some((no) => wanted.has(stockKey(no)))
          )
        )
        .map((m) => ({
          id: m.id, memoNo: m.memoNo, kind: m.kind, to: m.to,
          date: m.date, purpose: m.purpose, items: m.items,
        }));
  const events = sql ? await sqlEventsForStockNos(keys) : db!.events;

  for (const m of memos) {
    for (const line of linesFor(m.id, m.items, events)) {
      const key = stockKey(line.stockNo);
      if (!wanted.has(key)) continue;
      const found = out.get(key) || [];
      found.push({
        memoId: m.id,
        memoNo: m.memoNo,
        kind: m.kind,
        to: m.to,
        date: m.date,
        purpose: m.purpose,
        type: line.type,
        storedNo: line.stockNo,
        outcome: line.outcome,
        event: line.event,
      });
      out.set(key, found);
    }
  }

  // Newest first, as the ledger shows a piece's history.
  for (const found of out.values()) found.sort((a, b) => (a.date < b.date ? 1 : -1));
  return out;
}

// Every stock number the business has ever put on a memo, with where it is now.
export async function stockIndex(): Promise<
  { stockNo: string; type: string; memos: number; current: StockOutcome | null; lastMemoNo: string; lastDate: string }[]
> {
  const sql = await useSql();
  // The stock rows of every memo and nothing else: no recipient details, no
  // gold rows, no whole records.
  const db = sql ? null : await readDB();
  const memos = sql ? await sqlMemosWithItems() : db!.memos;
  const events = sql ? await sqlListEvents() : db!.events;

  const byStock = new Map<string, { type: string; memos: number; current: StockOutcome | null; lastMemoNo: string; lastDate: string }>();

  const chronological = [...memos].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const m of chronological) {
    for (const line of linesFor(m.id, m.items, events)) {
      const prev = byStock.get(line.stockNo);
      byStock.set(line.stockNo, {
        type: line.type || prev?.type || "",
        memos: (prev?.memos || 0) + 1,
        current: line.outcome, // latest memo wins, so this is where it stands now
        lastMemoNo: m.memoNo,
        lastDate: m.date,
      });
    }
  }
  return [...byStock.entries()]
    .map(([stockNo, v]) => ({ stockNo, ...v }))
    .sort((a, b) => (a.lastDate < b.lastDate ? 1 : -1));
}

// Update an existing memo's details. The identity fields (id, memoNo, seq, fy,
// createdAt) are preserved — a memo keeps its number even if the date changes.
function memoWith(existing: Memo, patch: NewMemo): Memo {
  // A memo never changes kind — it keeps the number it was issued under, and
  // that number says which book it belongs to.
  const items = existing.kind === "gold" ? [] : patch.items || [];
  const goldItems = existing.kind === "gold" ? patch.goldItems || [] : [];
  return {
    ...existing,
    to: patch.to,
    through: patch.through,
    mobile: patch.mobile,
    date: patch.date || existing.date,
    purpose: patch.purpose,
    comment: patch.comment,
    items,
    goldItems,
    againstMemoNo: patch.againstMemoNo || undefined,
    totalPcs: totalOf(items),
    totalGrossWt: sumBy(goldItems, (r) => r.grossWt),
    totalFineWt: sumBy(goldItems, (r) => r.fineWt),
    updatedAt: new Date().toISOString(),
  };
}

export async function updateMemo(id: string, patch: NewMemo): Promise<Memo | null> {
  if (await useSql()) {
    const existing = await sqlGetMemo(id);
    if (!existing) return null;
    const updated = memoWith(normalize(existing), patch);
    // One row, written once. The rest of the book is not touched.
    await sqlPutMemo(updated);
    return updated;
  }

  const db = await readDB();
  const idx = db.memos.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const updated = memoWith(db.memos[idx], patch);
  db.memos[idx] = updated;
  await writeDB(db);
  return updated;
}

export async function deleteMemo(id: string): Promise<boolean> {
  if (await useSql()) return sqlDeleteMemo(id);

  const db = await readDB();
  const before = db.memos.length;
  db.memos = db.memos.filter((m) => m.id !== id);
  if (db.memos.length === before) return false;
  await writeDB(db);
  return true;
}

// Full database (counters + memos) for backup. Counters are included so a
// restore preserves the serial-number sequence.
export async function exportDb(): Promise<DB> {
  if (await useSql()) {
    const [counters, memos, events, orders, parties] = await Promise.all([
      sqlCounters(),
      sqlListMemos(),
      sqlListEvents(),
      sqlListOrders(),
      sqlAllParties(),
    ]);
    return { counters, memos: memos.map(normalize), events, orders, parties };
  }
  return readDB();
}

// Overwrite the entire database from a previously exported backup.
//
// This one does not follow the records into D1, and it says so rather than
// appearing to work. Replacing every record means emptying five tables and
// writing thousands of rows, which is more than one request may do and is the
// most destructive thing in the portal; it needs its own screen, its own
// confirmation and its own progress, not a quiet reuse of this. Until then the
// honest answer is that it cannot run.
//
// Writing the R2 document instead would be worse than refusing: the restore
// would report success, the office would carry on reading D1, and nobody would
// know the restore had not happened.
export async function importDb(db: DB): Promise<void> {
  if (await useSql()) {
    throw new Error(
      "The records are in the Cloudflare database now, and a restore cannot write to it yet. Nothing has been changed. The downloaded backup file is still good: ask for the restore to be built before using it."
    );
  }

  const safe: DB = {
    counters: db && typeof db.counters === "object" && db.counters ? db.counters : {},
    memos: Array.isArray(db?.memos) ? db.memos : [],
    // Restoring must bring the movement history back too, or a restore would
    // quietly reset every piece to "still out" and lose the audit trail.
    events: Array.isArray(db?.events) ? db.events : [],
    // Same reasoning as events: a restore that dropped this would erase the
    // whole order book.
    orders: Array.isArray(db?.orders) ? db.orders : [],
    parties: Array.isArray(db?.parties) ? db.parties : [],
  };
  await writeDB(safe);
}
