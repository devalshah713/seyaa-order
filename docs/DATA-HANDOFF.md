# Seyaa Solitaire portal — data handoff

**For:** anyone building a separate, read-only portal that needs this app's PD sheet and diamond demand data.
**Source repository:** `devalshah713/seyaa-order`
**Written:** 12 October 2026. Shapes drift; check the files named here against the repo before trusting anything below.

> **Read this first.** There is **no SQL database, no ORM and no schema file.** This app stores nine whole JSON documents in Cloudflare R2 object storage. Each one is read entire, changed in memory, and written back entire. The sections below keep the usual headings but describe what is actually there.

---

## 1. Database

**Type:** none. Object storage holding nine JSON documents.

**Provider:** Cloudflare R2, bucket `seyaa-data`, over the S3 HTTP API.

**How the app connects:** `src/lib/db.ts` signs plain HTTPS requests with `aws4fetch`. No driver, no connection pool, no connection string.

```
https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${path}
```

**Settings.** There is no connection-string variable. Four are required:

| Variable | Kind | Where it lives |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | plain | `wrangler.jsonc`, under `vars` |
| `R2_BUCKET` | plain | `wrangler.jsonc`, under `vars` |
| `R2_ACCESS_KEY_ID` | secret | Cloudflare Worker secret |
| `R2_SECRET_ACCESS_KEY` | secret | Cloudflare Worker secret |

`BLOB_READ_WRITE_TOKEN` is a legacy fallback to Vercel Blob. Still supported in `db.ts`, not in use.

A deploy **wipes any plain variable `wrangler.jsonc` does not declare**. Secrets survive. That is why the first two live in the config file rather than the dashboard.

**For the reading portal:** mint a **separate R2 API token, scoped read-only to `seyaa-data`**. Do not reuse the portal's token.

### The nine documents

Listed in `src/lib/dbMigrate.ts` as `DOCUMENTS`:

| Path | Holds |
| --- | --- |
| `users/users.json` | user accounts |
| `memos/db.json` | memos, stock events, orders, parties |
| `pd/db.json` | **PD sheets** |
| `demand/db.json` | **diamond demands** |
| `jangad/db.json` | **diamond issue and return register** |
| `stockbook/db.json` | stock book |
| `qc/db.json` | QC records |
| `prices/db.json` | **price list and diamond master data** |
| `receipt-chase/db.json` | **chasing receipts against demands** |

The five in bold are the ones this document covers.

---

## 2. ORM / access layer

**None.** Raw `fetch` against the S3 API.

| Thing | Path |
| --- | --- |
| The only storage module | `src/lib/db.ts` |
| Document list | `src/lib/dbMigrate.ts`, `DOCUMENTS` |

`db.ts` exposes `readDoc<T>(path, fallback)`, `writeDoc(path, value)`, `docExists(path)` and `putBody(body)`. Every module goes through it and nothing else touches storage.

**There is no schema file.** The nearest equivalent is the TypeScript types, which are the authoritative shapes:

| Shape | File |
| --- | --- |
| `PdSheet`, `PdDB` | `src/lib/pdStore.ts` |
| `DiaLine` | `src/lib/pdConfig.ts` |
| `PdPiece`, `PieceStatus` | `src/lib/designNo.ts` |
| `Demand`, `DemandDB` | `src/lib/demandStore.ts` |
| `DemandRow`, `GROWTH_TYPES` | `src/lib/demandConfig.ts` |
| `ReceiptChase`, status values | `src/lib/receiptChase.ts` |
| `JangadRow`, `JANGAD_COLUMNS` | `src/lib/jangadConfig.ts` |
| `PriceList`, `RoundPrice`, `FancyPrice` | `src/lib/priceList.ts` |

**Nothing is validated on read.** Every field is optional in practice, and almost every value is a **string**, including numbers and dates.

---

## 3. Tables

Five documents matter. Each is one JSON object with an array inside.

### 3.1 `pd/db.json` — PD sheets

```ts
type PdDB = { counters: Record<string, number>; sheets: PdSheet[] };
```

`counters` maps a financial year (`"26-27"`) to the last sequence number used.

**`sheets[]` — `PdSheet`.** Primary key `id`.

| Field | Type | Note |
| --- | --- | --- |
| `id` | string | **PK**, `"PD-26-27-001"` |
| `pdNo` | string | `"PD/26-27/001"` |
| `fy` | string | `"26-27"` |
| `seq` | number | |
| `sku` | string | **the design number, and the real join key** |
| `photoPath` | string | Cloudinary URL, or a legacy Blob pathname |
| `photoPublicId` | string? | |
| `product` | string | same value as `category` |
| `category` | string | |
| `subCategory` | string | |
| `subSubCategory` | string | |
| `type` | string | |
| `tdw` | string | total diamond weight, e.g. `"20CT"` |
| `diaQuality` | string | |
| `goldWeight` | string | |
| `locks` | string | |
| `orderType` | string | |
| `assignedDate` | string | `yyyy-mm-dd` |
| `assignedTo` | string | |
| `size` | string | |
| `diaShape` | string | |
| `zone` | string | |
| `goldPurity` | string | |
| `goldColor` | string | |
| `priceRange` | string | |
| `diaWeightPointers` | string | the printed line |
| `quantity` | string | |
| `orderBy` | string | |
| `deliveryDate` | string | `yyyy-mm-dd` |
| `pdMerchandiser` | string | |
| `remarks` | string | |
| `diaLines` | `DiaLine[]`? | |
| `pieces` | `PdPiece[]`? | **derived, see below** |
| `line`, `caratCode`, `pointerRange` | string? | legacy, from when design numbers were auto-built |
| `createdBy`, `updatedBy` | string? | |
| `createdAt`, `updatedAt` | string | ISO |

**`DiaLine`** (all string): `shape`, `size` (sieve), `mm`, `pointer`, `pcs`, `pieces`.
`pieces` lists which sub-design numbers take this size, comma separated. Blank means all of them, which is the ordinary case.

**`PdPiece`**: `no` string, `n` number, `status` enum, `stockNo` string, `note` string.
`status` is one of `pending | production | ready | stock | cancelled`.

> **`pieces` is derived from `sku` on every read**, by `reconcilePieces()` in `src/lib/designNo.ts`, capped at `MAX_PIECES = 400`. Stored values are overlaid onto the derived list. A design number written as a run, `SN-BR-AMF-10CT-45-49`, means five pieces. Do not treat the stored array as independent truth.

### 3.2 `demand/db.json` — diamond demands

```ts
type DemandDB = { counters: Record<string, number>; demands: Demand[] };
```

**`demands[]` — `Demand`.** Primary key `id`.

| Field | Type | Note |
| --- | --- | --- |
| `id` | string | **PK**, `"DD-26-27-001"` |
| `demandNo` | string | `"DD/26-27/001"` |
| `fy` | string | |
| `seq` | number | |
| `date` | string | `yyyy-mm-dd` |
| `issuedTo` | string | diamond department or supplier |
| `notes` | string | |
| `rows` | `DemandRow[]` | the demand lines, nested |
| `pdId` | string? | **soft FK → `PdSheet.id`** |
| `pdNo` | string? | **soft FK → `PdSheet.pdNo`** |
| `createdAt`, `updatedAt` | string | ISO |

**`DemandRow`** — all string, and **no id of its own**:

`designNo`, `shape`, `pointers`, `pcs`, `comments`, `bags`, `growth`

`pointers` is the per-piece weight **as written**, e.g. `"1CT"`, `"0.75CT"`.
`growth` is expected to be one of `GROWTH_TYPES = ["CVD", "HPHT", "NATURAL"]`, not enforced.

### 3.3 `receipt-chase/db.json` — chasing receipts against demands

```ts
type ReceiptChaseDB = { chases: ReceiptChase[] };
```

**`chases[]` — `ReceiptChase`.** Primary key `id`.

| Field | Type | Note |
| --- | --- | --- |
| `id` | string | **PK**, `"<demandId>::<FLATTENEDDESIGNNO>"` |
| `demandId` | string | **soft FK → `Demand.id`** |
| `demandNo` | string | |
| `demandDate` | string | `yyyy-mm-dd`, copied from the demand |
| `designNumber` | string | **soft FK → `DemandRow.designNo`** |
| `issuedTo` | string | |
| `pdNo` | string | |
| `issuedAt` | string | ISO, **the clock's origin** |
| `status` | enum | see section 5 |
| `reminderNumber` | number | how many reminders have gone out |
| `nextReminderAt` | string | ISO, **the due date** |
| `lastRemindedAt` | string? | ISO |
| `lastMessageText` | string? | forwardable WhatsApp text; **names the supplier** |
| `completedAt` | string? | ISO |
| `closedBy` | string? | a username, or `"the jangad register"` |
| `jangadRef` | string? | **soft FK → `JangadRow.id`** |
| `events` | `ReceiptChaseEvent[]` | capped at `MAX_EVENTS` = 60 |
| `createdAt`, `updatedAt` | string | ISO |

**`ReceiptChaseEvent`**: `at` ISO, `kind` one of `opened | reminder | done | cancelled | paused | resumed`, `n` number?, `note` string, `by` string?.

The key is built by `chaseId()`:

```ts
`${demandId}::${designNumber.toUpperCase().replace(/[^A-Z0-9.]/g, "")}`
```

> **This is a chase tracker, not a goods receipt.** It records that someone is waiting, not what arrived.

### 3.4 `jangad/db.json` — the diamond issue and return register

```ts
type JangadDB = { rows: JangadRow[]; seq: number };
```

**This is where diamonds physically going out and coming back are recorded.** For issued versus received quantities, this is the table, not the chase.

```ts
type JangadRow = Record<JangadField, string> & {
  id: string;
  pdId?: string; pdNo?: string; demandNo?: string; runNo?: string;
  createdAt: string; updatedAt: string;
};
```

**Every `JangadField` is a string.** Grouped by the stage they are filled in at:

| Stage | Fields |
| --- | --- |
| issue | `date`, `designNo`, `subDesignNo`, `product`, `shape`, `setting`, `certiNo`, `size`, `pcs`, `carats`, `growth`, `price`, `memoNo`, `mfgName`, `addOn` |
| received | `ctsUsed`, `pcsUsed`, `totalPrice`, `receivedDate` |
| returned | `ctsReturn`, `pcsReturn`, `returnDate`, `status`, `stockCode`, `sellGivenDate`, `sellGivenStatus`, `comments` |

Plus `id` (**PK**), `pdId`? (**soft FK → `PdSheet.id`**), `pdNo`?, `demandNo`? (**soft FK → `Demand.demandNo`**), `runNo`? (the whole design run), `createdAt`, `updatedAt`.

> A piece is split across **two** columns, `designNo` and `subDesignNo`. Rejoin them with `joinDesignNo(designNo, subDesignNo, "")` from `src/lib/designNo.ts` before matching.

`addOn` marks stones issued against a piece that already had its diamonds, usually a stone broken at the factory.

### 3.5 `prices/db.json` — diamond master data

```ts
type PriceList = {
  rates: { gold: ByKarat; labour: ByKarat; polkiLabour: ByKarat };
  round: RoundPrice[];
  fancy: FancyPrice[];
};
```

**`round[]` — `RoundPrice`:** `code` string (**PK**, e.g. `"+6.5-11 : 01"`), `sieve` string, `mm` string, `pointers` string, `usd` number|null, `inr` number|null.

**`fancy[]` — `FancyPrice`:** `code` string (**PK**, e.g. `"OV : 01"`), `shape` string, `pointers` string, `mm` string, `usd` number|null, `inr` number|null.

Codes are matched spacing-insensitively via `codeKey()` (uppercase, strip whitespace). The round table is searched first, then fancy. No code appears in both.

> **Colour and clarity are not modelled.** There is no colour table and no clarity table. The only quality field is `PdSheet.diaQuality`, free text, with a single suggested value: `DIA_QUALITIES = ["VVS/VS-EF"]` in `src/lib/pdConfig.ts`.

Other master lists are hard-coded constants, not stored data:

| Constant | File | Values |
| --- | --- | --- |
| `DIA_SHAPES` | `pdConfig.ts` | Round, Oval, Pear, Marquise, Emerald, Princess, Cushion, Radiant, Heart, Baguette |
| `GROWTH_TYPES` | `demandConfig.ts` | CVD, HPHT, NATURAL |
| `GOLD_PURITIES` | `pdConfig.ts` | 14KT, 18KT, 10KT, 9KT, 22KT |
| `GOLD_COLORS` | `pdConfig.ts` | White Gold, Yellow Gold, Rose Gold |
| `ZONES` | `pdConfig.ts` | USA, Dubai, Hong Kong, India |

---

## 4. Relationships

> **No foreign keys are enforced.** Nothing cascades and nothing is checked on write. Every link below is a string that may be blank, stale, or point at a deleted record.

### PD sheet → demand

Two ways, and a reader needs both:

1. `Demand.pdId === PdSheet.id`, or `Demand.pdNo === PdSheet.pdNo`. Only set when the demand was raised from the sheet.
2. Otherwise by design number: `DemandRow.designNo` against `PdSheet.sku`, using `matchDesign()` or `sameDesignOrPiece()` from `src/lib/designNo.ts`, **never string equality**. A sheet written as the run `SN-BR-AMF-10CT-45-49` must match a demand line for the single piece `SN-BR-AMF-10CT-46`.

The logic the app uses, from `src/lib/designTrace.ts`:

```ts
const mine = demands.filter(
  (d) =>
    (sheet.id && d.pdId === sheet.id) ||
    d.rows.some((r) => r.designNo && matchDesign(r.designNo, pieceNo))
);
```

### Demand → lines

Containment, not a join. `Demand.rows` is a nested array.

> **Demand lines have no identity.** No line id, no line number, no stable key. A line is identified only by its position in the array and by `designNo`. Editing or reordering a demand silently changes which line is which, so nothing stored elsewhere can point reliably at one line.

### Issue / receipt → demand line

No direct link. Three hops, all soft:

| From | To | Via |
| --- | --- | --- |
| `ReceiptChase` | `Demand` | `demandId` |
| `ReceiptChase` | demand line | `designNumber`, flattened; **not** a line index |
| `JangadRow` | `Demand` | `demandNo`, often blank |
| `JangadRow` | design | `joinDesignNo(designNo, subDesignNo)` matched with `matchDesign` |

A chase closes when any jangad issue row matches its design number. `jangadRef` then holds that row's `id`.

### Partial fulfilment

Yes, in two different senses, tracked differently.

- **Across designs — tracked.** One chase per design number per demand, so a four-design demand is four independent chases. Three arriving does not close the fourth.
- **Within one design, by quantity — not tracked.** A chase is binary: open (`watching` / `reminding` / `paused`) or `done`. Nothing compares demanded pieces or carats against received ones, and the first matching jangad row closes the chase whatever the quantity.

> **If the reading portal needs partial quantities, it must compute them itself from the jangad rows.** See section 6.

---

## 5. Status and dates

### Demand status

**A `Demand` has no status field.** Its state lives entirely in the related `ReceiptChase` records.

### `ReceiptChaseStatus` — the five values

Defined in `src/lib/receiptChase.ts`.

| Value | Label shown | Meaning |
| --- | --- | --- |
| `watching` | Waiting | issued; the first gap is still running, nobody chased yet |
| `reminding` | Chasing | the gap elapsed with no bags on the jangad; reminders going out |
| `paused` | Paused | hit `MAX_REMINDERS` = 30; waits for a person rather than pinging forever |
| `done` | Received | a jangad issue entry exists |
| `cancelled` | Cancelled | closed by hand; not coming |

```ts
const OPEN_STATUSES = ["watching", "reminding", "paused"];
```

Use the exported `isOpenStatus(s)` rather than re-listing them.

### `JangadRow.status`

A **free-text string** typed by the accountant. Not an enum, not validated. The app only ever *suggests* a value from which stage dates are filled in, and never overwrites what was typed. Do not rely on it.

### Every timestamp

| Column | Document | Format | Meaning |
| --- | --- | --- | --- |
| `PdSheet.createdAt` / `updatedAt` | pd | ISO | |
| `PdSheet.assignedDate` | pd | `yyyy-mm-dd` | design assigned |
| `PdSheet.deliveryDate` | pd | `yyyy-mm-dd` | wanted by |
| `Demand.date` | demand | `yyyy-mm-dd` | demand date as written |
| `Demand.createdAt` / `updatedAt` | demand | ISO | |
| `ReceiptChase.demandDate` | chase | `yyyy-mm-dd` | copied from the demand |
| `ReceiptChase.issuedAt` | chase | ISO | **the clock's origin** |
| `ReceiptChase.nextReminderAt` | chase | ISO | **the due date** |
| `ReceiptChase.lastRemindedAt` | chase | ISO | |
| `ReceiptChase.completedAt` | chase | ISO | **fulfilled / closed** |
| `ReceiptChase.createdAt` / `updatedAt` | chase | ISO | |
| `ReceiptChaseEvent.at` | chase | ISO | per event |
| `JangadRow.date` | jangad | date string | issued |
| `JangadRow.receivedDate` | jangad | date string | received back |
| `JangadRow.returnDate` | jangad | date string | balance returned |
| `JangadRow.sellGivenDate` | jangad | date string | |
| `JangadRow.createdAt` / `updatedAt` | jangad | ISO | |

### Where the due date comes from

`nextReminderAt` is **computed, never entered**. From `src/lib/chaseTime.ts`:

```ts
export function gapMinutes(n: number): number {
  return (n <= 1 ? firstGapHours() : repeatGapHours()) * 60;
}

export function dueAt(from: Date, n: number): Date {
  return nextWorkingMoment(new Date(from.getTime() + gapMinutes(n) * 60_000));
}
```

- **First reminder:** `dueAt(issuedAt, 1)`, default **24 hours** after `issuedAt`. Override with `RECEIPT_CHASE_FIRST_HOURS`.
- **Later reminders:** `dueAt(now, n + 1)`, measured from when the last reminder went out, default **24 hours**. Override with `RECEIPT_CHASE_REPEAT_HOURS`.
- A value that is not a positive number is **ignored rather than obeyed**, so a typo cannot silently stop the chasing.
- `nextWorkingMoment()` pushes the result into **Monday to Saturday, 08:00 to 19:00 IST**. A due time outside that window slides to the next open moment, so `nextReminderAt` is rarely exactly `issuedAt + 24h`.

> **There is no delivery due date on a demand.** The only promised date anywhere is `PdSheet.deliveryDate`.

---

## 6. Calculations

> **Pending quantity and pending carats do not exist in this codebase.** Nothing computes demanded minus received. The app never answers "how much is still outstanding".

Three related calculations do exist.

### 1. `shortfall()` — jangad reconciliation, not pending

`src/lib/jangadConfig.ts`. It runs only **after** the diamonds have come back, and measures leakage rather than outstanding work.

```ts
export function shortfall(row: JangadRow): { cts: string; pcs: string } | null {
  if (!row.returnDate.trim()) return null;

  const issuedC = num(row.carats), usedC = num(row.ctsUsed), backC = num(row.ctsReturn);
  const issuedP = num(row.pcs), usedP = num(row.pcsUsed), backP = num(row.pcsReturn);

  let cts = "", pcs = "";
  if (issuedC !== null && usedC !== null && backC !== null) {
    const gap = issuedC - usedC - backC;
    if (Math.abs(gap) > 0.00005) cts = round(gap, 4);
  }
  if (issuedP !== null && usedP !== null && backP !== null) {
    const gap = issuedP - usedP - backP;
    if (gap !== 0) pcs = round(gap, 0);
  }
  return cts || pcs ? { cts, pcs } : null;
}
```

So: `issued − used − returned`. Carats to 4 decimal places with a 0.00005 tolerance, pieces exact. Returns null while `returnDate` is blank.

### 2. What actually went into the piece

`src/lib/stockBookStore.ts`, when seeding a stock entry:

```ts
breakupWt: r.ctsUsed || r.carats,
pcs: r.pcsUsed || r.pcs,
```

Used-if-present, otherwise issued.

### 3. Open chase count

`openReceiptCount()` in `src/lib/receiptChaseStore.ts` counts chases whose status is in `OPEN_STATUSES`. A count of **designs awaited**, not quantities.

### Building "pending" yourself

- **Demanded** comes from `DemandRow.pcs` and `DemandRow.pointers`, both free-text strings; `pointers` is written like `"1CT"`.
- **Received** comes from summing `JangadRow.ctsUsed` and `pcsUsed` over rows whose rejoined design number matches, using `matchDesign`.
- Expect to parse strings and to meet blanks on every field.

---

## 7. API

All routes require a session cookie. `src/middleware.ts` returns a `401` JSON body for any `/api/*` request without one.

> **There is no API key, no read-only token and no CORS.** A separate portal cannot call these routes as they stand.

| Route | Methods | Returns |
| --- | --- | --- |
| `/api/pd` | GET, POST | GET: `{ sheets: PdSheet[] }`, every sheet hydrated |
| `/api/pd/[id]` | PATCH, DELETE | |
| `/api/pd/[id]/pieces` | PATCH | |
| `/api/pd/lookup?design=` | GET | `{ query, results[] }` |
| `/api/pd/register` | GET, POST | Google Sheet design register status and sync |
| `/api/demand` | GET, POST | GET: `{ demands: Demand[] }`, or `{ demandNo }` with `?next=` |
| `/api/demand/[id]` | PATCH, DELETE | |
| `/api/receipt-chase` | GET | the chase list |
| `/api/receipt-chase/[id]` | POST | act on one chase |
| `/api/receipt-chase/tick` | — | the worker; accepts a `CRON_SECRET` bearer or `x-backup-token` |

`/api/pd/lookup?design=SN-BR-AMF-10CT-46` returns per result: `id`, `pdNo`, `designNo`, `matched` (`"piece"` or `"design"`), `piece`, `pieceStatus`, `stockNo`, `product`, `quantity`, `totalPieces`, `assignedTo`, `deliveryDate`.

**Recommendation: do not go through these routes.** Read R2 directly with a read-only token. `GET /api/pd` hydrates every sheet's piece list and has been the subject of repeated work to keep it inside the Cloudflare Workers CPU limit.

---

## 8. Sample data

A read-only sampling script is committed at **`scripts/sample-rows.mjs`**.

```bash
R2_ACCOUNT_ID=... R2_BUCKET=seyaa-data \
R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
node scripts/sample-rows.mjs
```

It reads only and never writes. It prints total counts, then five rows each from `pd/db.json`, `demand/db.json`, `receipt-chase/db.json`, `jangad/db.json`, and the round and fancy price tables.

Party, supplier and manufacturer names are replaced with stable placeholders (`PARTY_001`), so rows that referred to one firm still refer to one firm. `lastMessageText` is dropped because it quotes the supplier by name. Design numbers, stock numbers, weights and dates are left untouched, since those are the fields a reader matches on.

Verified to parse and to refuse cleanly when the settings are absent:

```
$ node scripts/sample-rows.mjs
Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY first.
```

> **No sample output is pasted into this document.** It was written in an environment with no R2 credentials, and inventing rows would be worse than leaving the space empty. Run the script against the live bucket to get real rows.

---

## Four things that will bite a reader

1. **Almost every value is a string**, including carats, pieces and prices. `pointers` is written as `"1CT"`. Numbers need parsing, and blanks are common everywhere.
2. **Design numbers never match by equality.** Use `matchDesign()` from `src/lib/designNo.ts`. A sheet is stored as a run; a demand line may name one piece of that run.
3. **Demand lines have no identity.** Nothing stored outside this app can point reliably at one line of one demand.
4. **A document is written whole.** Writing would clobber concurrent edits, and reading during a write can yield a torn document. Keep the second portal strictly read-only.
