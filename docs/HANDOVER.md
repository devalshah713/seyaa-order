# Handover

Everything somebody picking this up needs to know, written for an assistant
starting fresh with no memory of how it got here.

Read `CLAUDE.md` first. It says who the owner is, how to talk to him, and the
rules that are not negotiable. This file is the state of things.

---

## 1. What this is

An internal operations portal for Seyaa Solitaire, a diamond jewellery
business in India. It replaced a set of Google Sheets and a lot of WhatsApp.

- Live at **https://seyaa-order.devalshah713.workers.dev**
- Code at **github.com/devalshah713/seyaa-order**, deployed from `main`
- Cloudflare Worker named **seyaa-order**. There is a different worker called
  `seyaa-jewels` in the same account that is **not** this project.
- The old `seyaa-order.vercel.app` is retired and only redirects.

The owner, Deval, is not a programmer. He works on Windows in Chrome and does
everything through dashboards. His sellers work from phones only.

---

## 2. The one constraint that shaped the whole codebase

**A request gets 10 milliseconds of processor time on the Cloudflare Workers
free plan.** Not 10 seconds. Waiting on the network does not count; working
does.

Almost every odd-looking decision here follows from that. Error 1102 means
that limit was exceeded, and the office saw it daily until the work described
below was done. Before changing anything that runs per request, ask what it
costs in processor time at the size the books have actually reached:

- jangad register: around 4,900 rows and growing weekly
- stock book: around 3,429 pieces
- memos: around 255
- PD sheets, demands, quotations: hundreds

Two patterns exist because of this, and new code should follow them:

- **Projection.** A list page selects the few columns it shows and never reads
  whole records. Handing a `"use client"` component whole records costs the
  time of serialising them.
- **One row, not one book.** A save writes one row. It must never read a whole
  book, change one thing and write the book back.

---

## 3. Where the records live

Originally: nine JSON documents in the R2 bucket `seyaa-data`, read and
written through `src/lib/db.ts`. That is what made saving one record cost the
size of the whole book.

Five books have moved into **Cloudflare D1** (`seyaa-data`, id in
`wrangler.jsonc`): memos, the jangad register, PD sheets, diamond demands and
the stock book. Quotations were born there.

Still on R2 documents: **prices, users, QC, receipt chase.** Prices and users
are tiny and rarely written. QC and receipt chase are small today and will
need moving when they grow.

### How a module knows which store is live

`hasSql() && <module>IsInSql()`, asked on every call. Both halves must be
true: the database attached, and that module's records copied into it, which
a flag records (`memos:filled`, `jangad:filled`, `pd:filled`,
`demands:filled`, `stockbook:filled`). Until the flag is set the R2 path runs,
unchanged, underneath. **Nothing was ever deleted from R2.** Those documents
are still a complete copy as of the day each module moved.

There is no half-way state on purpose. A book misread as empty would put a
blank document over the real one on the next save.

### The table/doc shape

Every D1 table has real columns for what a list page sorts, filters or
searches on, plus `doc TEXT NOT NULL` holding the whole record as JSON. A new
field needs no schema change because it rides in `doc`. It only needs a column
when a list page starts filtering on it. Read the comment at the top of
`src/lib/sqlSchema.ts`; it is the rule everything else follows.

### A trap that has already bitten once

A table is created by the migration that fills its module, and **nothing else
asks for it**. So adding a table to a module that migrated weeks ago means the
live database never learns about it, and the first person to open the page
gets `D1_ERROR: no such table`. That happened with `memo_quotations`.

The quotation statements now mend it themselves (see `withQuotationTable` in
`src/lib/memoSql.ts`), but **that is a plaster on one table, not a cure**. The
proper fix is for a module to apply its schema the first time it is used
rather than only when it is migrated. It has not been done.

---

## 4. How a deploy actually works, and the two things that break it

Workers Builds deploys from `main` on GitHub. Pushing to `main` starts a
build. **Two settings in the Cloudflare dashboard decide whether that build
reaches anybody**, and both have caused silent failures:

### Build command

Must be **`npm run cf:build`**. It was `npx opennextjs-cloudflare build`,
which bypasses the project's own script, so a fix kept in `package.json` was
never read and every build failed.

### Deploy command

It is `npx wrangler versions upload`, which uploads a version **without
sending traffic to it**. So a green build does not go live. Somebody has to
open the Deployments page, find the newest version, open its `…` menu and
promote it, and watch the Active deployment box change.

This has caught the owner out: the site sat three days behind while every
build was green. Changing that box to `npx wrangler deploy` would make a green
build go live on its own. **It has been offered and not yet done.** If it is
still `versions upload`, every change needs that manual promote.

### The Next.js support gate

`package.json` passes `--dangerouslyUseUnsupportedNextVersion` to
`opennextjs-cloudflare`. **This is not optional and must not be removed.**

Next.js 15 reached the end of its two-year support window on **21 October
2026**, and from that date `@opennextjs/aws` refuses to build before it reads
a line of source. Without the flag no deploy of this site can succeed at all.

The real answer is **moving to Next.js 16**, which has not been done. It is a
real job with real risk to sign-in and the data layer, and it should be
planned, not squeezed in. Until then the flag stays.

---

## 5. What is in the portal

Access is per module, set per account under Users. The module list is in
`src/lib/access.ts`; the URL prefixes it guards are in the same file.

| Module | What it is |
|---|---|
| Memos | Delivery and gold memos, numbered per financial year, plus history |
| Orders | Orders, quotations, the approval chain, the WhatsApp board |
| Stock | The stock ledger from memos, available stock, the stock number audit |
| PD Sheets | Product development sheets, the design number, the pieces of a run |
| Diamond Jangad | Diamonds issued, used and returned, per piece per stone size |
| Stock Book | Finished pieces taken into stock and valued from the price list |
| QC | Checking a finished piece once it is in stock |

Plus, for admins only: Lists (the controlled vocabularies), Users, Backups.

### Things worth knowing about specific modules

- **Design numbers never match by string equality.** A run
  `SN-BR-AMF-10CT-45-49` contains the piece `...-46`. `matchDesign()` and
  `sameDesignOrPiece()` in `src/lib/designNo.ts` decide this, and it is
  arithmetic on the parts of a number, not anything SQL `LIKE` can express.
  Narrow with SQL, then match in memory. Both list pages do exactly that.
- **The register and the stock book pages are capped.** They open on the
  latest 400 entries and say so; filters bring back up to 1,000. Handing the
  browser the whole book is what made them time out.
- **The price list is the one source of money.** `pricePiece` in
  `src/lib/priceList.ts` values a piece from gold rate by karat, labour, polki
  labour and diamond rates by product code. The stock book and quotations both
  go through it. Nothing stamps a price onto a record, so changing a rate
  moves every figure.
- **Printing is the browser's.** There is no server-side PDF, no headless
  Chrome, no Drive upload. Do not bring them back without being asked.
- **Crons** are declared in `wrangler.jsonc` and mapped to routes in the
  `SCHEDULE` map in `cloudflare/worker.ts`. Change both together. Today: the
  nightly Google Sheet copy, and the diamond receipt check each working
  morning.

---

## 6. Orders and quotations: the flow the owner wanted

This was built and rebuilt several times because the shape was misread. This
is the settled version.

### The firm's hierarchy

Deval is the head. Rahul is under him. Dhruval and Shalin are under Rahul.
Everybody else reports to Deval directly. The manager is **data**, set per
account on the Users screen, not names in code. The owner is never offered as
a manager because every order reaches him anyway.

### An order

A seller raises it on his phone. Compulsory: what is being made in words, a
reference picture (uploaded, no link), category from the list, gold details,
quantity, size, diamond shapes (several allowed), approximate carats, and
certified or not. Sub-category and sub-sub-category are free text on purpose.

The portal stamps the order number, the minute and the account that entered
it, and none of those can be written over, including by a crafted request.

Then: the seller's manager approves it if he has one, then an admin approves
it. A send back at either stage returns it to the seller with a reason; he
corrects it and sends it in again and it starts from the beginning. Nobody
approves their own order. An order entered by an admin goes ahead as written,
because there is nobody above the head to ask. A seller whose manager is an
admin waits once, not twice. All of this is in `src/lib/orderApproval.ts`.

**Once an order is in, a seller cannot change or delete it.** The one
exception is his own order sent back to him to correct, and even then not its
status, manufacturer or design number. Deleting is the owner's alone.

After approval: the owner assigns the manufacturer and the design number, a
short message is drafted for him to copy into WhatsApp, and the PD man presses
one button to start the PD sheet with everything carried across.

### A quotation

A seller raises it with what he has in hand, including his own estimate of the
gold weight in grams and a line per stone size. **None of his figures is
compulsory** — he sends what he knows, because a form that refuses him sends
him back to WhatsApp, which is the thing being replaced. He never sees a
price; his browser is sent a code book with no rates in it.

It comes to the owner reading "Waiting for your approval". He corrects what is
out, the cost works itself out from the price list as he types, and he puts
the price on. One press approves and prices it. What the seller originally
sent is kept and shown whenever the two differ.

The seller then opens it and reads the price to the customer. Only a priced
quotation can produce the customer's text or become an order.

---

## 7. How work is verified here

Four checks, every time, from a cleared `.next` and `.open-next`:

```bash
rm -rf .next .open-next
npx tsc --noEmit
npx tsc --noEmit -p cloudflare/tsconfig.json
npm run build
npm run cf:build
```

Do not run two builds at once in the same tree; they share `.next` and fail
spuriously.

Beyond that, this project has a habit worth keeping: **exercise the change
rather than asserting it works.** There are harnesses that bundle the real
route handlers, stores and schema with `esbuild` and run them against real
SQLite through a D1-shaped wrapper, plus an R2 document stand-in and a forged
session cookie. They live in the session scratchpad rather than the repo, so a
new session will need to rebuild them, but the approach is what matters: they
have caught real faults that reading could not, including a search that
matched every row, a demand number that would never have been searchable, and
a quotation total that did not multiply cleanly.

The phone layout is checked by opening the pages in Chromium through
Playwright at 360, 390 and 414 pixels and auditing for sideways scroll, text
boxes under 16px (which makes iOS zoom on every tap) and anything tapped under
44px. Do not report a phone layout you have not looked at.

---

## 8. Hard rules

- **No secrets in `wrangler.jsonc` or any committed file.** `R2_ACCOUNT_ID`
  and `R2_BUCKET` are there because they are not secrets, and because a deploy
  **wipes any plain-text variable the file does not declare**. Secrets live in
  the Worker's settings.
- **`MOVED_TO` is set on Vercel only.** Set on Cloudflare it redirects the
  site to itself forever.
- **"Not there" is an answer; anything else is not.** A store that cannot be
  reached must never read as an empty module, or the next save overwrites a
  full document with a blank one. The same rule governs every screen: "nothing
  found" and "could not be read" are different sentences.
- **Never ask the owner to paste a credential into chat.** Credentials move
  dashboard to dashboard, and he is told which page to find each one on.
- `nodejs_compat` is load-bearing: passwords are hashed with scrypt and the
  Google service-account token is signed with `createSign`.
- Pull requests are created only when he asks for one.

---

## 9. Known and unfinished

Honest list, worst first.

1. **Next.js 15 is out of support.** The build only runs because of a flag.
   Moving to 16 is the real fix and has not been started.
2. **Schema creation only happens at migration time** (section 3). The next
   table added to an existing module will break the same way quotations did.
3. **The Cloudflare deploy command** still uploads without promoting, unless
   it has been changed since this was written.
4. **QC and receipt chase are still whole-document reads and writes.** Small
   today. They will need D1 when they grow, and the pattern is established.
5. **`GET /api/jangad` still returns the whole register.** Nothing in the app
   calls it; it is reachable by hand and carries the cost that was removed
   from the page.
6. **Against the R2 document path, two records saved in the same instant can
   share a number.** This is how that path has always worked, it is
   documented at the head of `memoStore.ts`, and it does not apply to the five
   books in D1, which take the number inside the transaction that writes the
   row. It would need a conditional write in `db.ts`, the riskiest file here.
7. **Platinum and silver quote at the 14KT gold rate**, because the price list
   holds no rate for either. The quotation form says so on screen. If the
   owner supplies rates, put them in properly.
8. **Certified and non-certified do not change any price.** The price list has
   no separate rates. It is recorded as a fact about the piece.
9. **No edit screen for an order after it is sent back** beyond the inline
   fields; category, shape, sieve, stone count and the picture need the order
   deleted and re-entered.
10. **A deleted manager leaves their sellers' manager pointing at nothing.**
    Those orders then go straight to the owner. Not cleaned up.

---

## 10. What an assistant cannot do from here

Worth knowing so you do not promise it.

- **No access to the live data.** No R2 keys, no D1 credentials. You cannot
  read the owner's records, so you cannot answer "what happened to stock
  number X" yourself. That is why `/stock/audit` was built: he runs it.
- **No access to the Cloudflare dashboard.** You cannot see whether a build
  went green or promote a version. Ask him to look and tell you, and give him
  the exact menu to click.
- **The live site is not reachable** from the session's network.

When one of these blocks you, say so plainly and build him the thing that
answers it instead.
