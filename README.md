# Seyaa Solitaire — Memo Generator

A Next.js (App Router) tool for generating delivery memos for jewellery leaving
the office. Every memo is auto-numbered, saved, and searchable.

## Features

- **New Memo** (`/memo/new`) — enter recipient details, pick a purpose, and add
  jewellery by Type with all its stock numbers (comma-separated, 6 chars each).
  A live A4 preview updates as you type. Save assigns the memo number and opens
  the print dialog.
- **History** (`/memo`) — every saved memo, searchable by memo number,
  recipient, or stock number. Click a row to reopen and reprint it.
- **Memo numbering** — running serial per Indian fiscal year, e.g. `SS/26-27/001`,
  assigned server-side so numbers never clash.

## Storage

Every module keeps one JSON document, all of them in a private **Cloudflare R2**
bucket. Reading and writing goes through `src/lib/db.ts` and nowhere else.

R2 rather than Vercel Blob because the website and the records used to be the
same account: when a payment failed at Vercel the office lost not just the site
but every PD sheet, demand, jangad entry and stock record, and the ability to
sign in at all. They are now two companies.

Four variables: `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`. R2 speaks the S3 protocol, so reaching it is a signed
HTTPS request — the same code works on Vercel and on Workers.

**During the move both stores are configured at once.** R2 is the record;
anything R2 has not got yet is read from Blob; every save is written to both. So
the order does not matter — deploying before the copy has run, or copying before
the variables are set, both work. Removing `BLOB_READ_WRITE_TOKEN` is what ends
it. **Backups → Moving to Cloudflare** says what is in which store and copies
the rest across.

One rule holds the whole thing up: **"not there" is an answer and anything else
is not.** Every screen does read, change, write, so a store that cannot be
reached must never read as an empty module — it would put a blank document back
over a full one the moment somebody saved. Only a clean "no such document" reads
as empty; unreachable, refusing or suspended is an error the page shows.

## Design photos

Photos on a PD sheet go **straight from the designer's browser to Cloudinary**
and are served from there. They never touch the portal: it was the photos, not
the data, that ate a month of Vercel Blob allowance in six weeks. The photo is
still compressed in the browser first — a phone photo is several megabytes and
nothing on a PD sheet needs that.

Cloud name and upload preset live in `src/lib/cloudinary.ts`. Neither is a
secret: an unsigned preset has to be readable in the page for a browser to post
with it. The trade is that anyone reading the page source could upload to this
Cloudinary account; disable the preset in Cloudinary if that is ever abused.
**Photos are public at unguessable URLs** — accepted by the owner, and no worse
than the Blob store they came from, which was itself a public store.

Everything shows a photo through `photoSrc()`, which is now barely a rule at
all: a URL is used, anything else is treated as no photo. It is kept so that
every screen still goes through one place if photos ever move again.

The photos that predated this lived in Vercel Blob, were uploaded through
`/api/upload` and served back through `/api/photo`. All of them were moved
across in one pass and those two routes, and the one-off migration behind them,
have been deleted. The databases moved separately and later — see **Storage**.

## Backups

Two copies of everything, both nightly at midnight IST.

**The office PC** — the restorable one. `windows-backup\backup.ps1` runs as a
scheduled task and pulls the whole database as one JSON file, the Excel
workbooks (memos, jangad, stock book, QC) and every memo PDF into
`C:\SeyaaBackups`. It authenticates with `BACKUP_TOKEN`, so nobody has to be
signed in.

**A Google Sheet** — the readable one. Every module gets its own tab: design
numbers, PD sheets, diamond demands, diamond receipts, the jangad register, the
stock book, QC and memos, plus a **Backup Log** tab saying when the copy last
ran. Each tab is
replaced rather than appended to, so a sync that runs twice changes nothing.
Vercel's scheduler calls `/api/backup/sheets` at 18:30 UTC (`vercel.json`),
which is midnight in India; the office PC's own job calls it too, and an admin
can run it by hand from **Backups** in the top bar.

## Chasing diamond receipts

A diamond demand is only half the job: the bags still have to come back from
the diamond team and be written onto the jangad. **Diamond Receipts**
(`/demand/receipts`) watches every demand from the moment it is issued until a
jangad issue entry exists for that design number.

- One chase per design number on a demand — a demand covering four designs is
  four things to wait for, and three of them arriving is not all of them.
- Nothing is chased until it is **24 hours** old, and after that at most once a
  day. Both gaps are settable in Vercel (`RECEIPT_CHASE_FIRST_HOURS`,
  `RECEIPT_CHASE_REPEAT_HOURS`); a value that is not a positive number is
  ignored rather than obeyed, so a typo cannot silently stop the chasing.
  Shortening the repeat is only worth doing alongside a schedule that runs more
  than once a day.
- Reminders only go out **Monday to Saturday, 08:00–19:00 IST** — the office
  works Saturdays, and only Sunday is off. One falling due outside that waits
  for the window to open and keeps its number. The window is enforced twice:
  when the next reminder is timed, and again before it is sent, so the rule
  does not rest on the crontab being right.
- Every reminder is posted to the Grok Bot with a `messageText` block written
  ready to forward to the WhatsApp group **Diamond bagging group internal**.
  Nothing is sent to WhatsApp automatically — Deval forwards it by hand, and
  the same text is on the screen with a **Copy text** button.
- Saving a jangad issue entry closes the chase there and then; the worker also
  re-checks the register immediately before every reminder, so a chase answered
  outside the app never gets one.

The worker is `/api/receipt-chase/tick`. It holds no state and each run only
does what has come due, so calling it often costs nothing and missing a run
costs nothing either — the next one catches up everything overdue.

`vercel.json` runs it **once each morning at 02:35 UTC, which is 08:05 in
India, Monday to Saturday** (`35 2 * * 1-6`). So: at most one reminder per
design per working day, and nothing on Sunday.

**The schedule and the working window must name the same days.** A run on a day
the window excludes finds every reminder deferred and sends nothing at all,
silently, for that whole day. Change one and change the other — `inWorkingHours`
in `src/lib/chaseTime.ts`.

Two things about that time are deliberate. It is **inside the 08:00–19:00
window** — a run a minute either side of 08:00 would find every reminder
deferred by quiet hours and send nothing at all, losing the whole day — and the
five-minute margin absorbs the scheduler's drift, which is a few seconds in
practice.

The consequence to know: with one run a morning, a demand issued **after** 08:05
is not chased the next morning but the one after, because at the next run it is
still under 24 hours old. Monday 11am is first chased Wednesday morning. That
errs late rather than early, which is the safe direction — it never breaks the
"leave them a full day" rule. To have it chased the very next morning, lower
`RECEIPT_CHASE_FIRST_HOURS` to about 12, or add a second cron run.

**Run the checks now** is the deliberate exception to quiet hours: an admin
pressing it is obeyed whatever the day or hour, including a Sunday. A scheduler
never is.

**Cloudflare has no daily cron limit**, so the once-a-day cadence is now an
office decision rather than a plan limit. Running more often means changing two
things together: the schedule in `wrangler.jsonc` *and* its entry in the
`SCHEDULE` map in `cloudflare/worker.ts` — a schedule with no mapping runs
nothing and says so in the log. `RECEIPT_CHASE_REPEAT_HOURS` then wants
lowering to match, or the screen promises a reminder no run exists to send.

Worth keeping for the record, from when this was on Vercel: **on Hobby a cron
may only run once a day, and asking for more does not fail loudly — the
deployment is simply never created, with no error anywhere.** Measured on this
project: `*/5 * * * *` and `0 * * * *` each produced no deployment at all, while
the same commit with a daily schedule deployed in two seconds.

An admin can run it by hand at any time from **Run the checks now** on the
screen.

Environment variables — on Cloudflare these are Worker **secrets**
(`wrangler secret put NAME`), never entries in `wrangler.jsonc`, which is in the
repository:

| Variable | What it is for |
| --- | --- |
| `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | the storage every module reads and writes |
| `BLOB_READ_WRITE_TOKEN` | the old Vercel store; set only while the move is in progress, then removed |
| `AUTH_SECRET` | signs the session cookie |
| `BACKUP_TOKEN` | lets the office PC download without a login, and lets the Apps Script run the receipt chase |
| `CRON_SECRET` | lets the scheduler call the nightly sheet copy and the receipt chase |
| `GROK_DIAMOND_RECEIPT_WEBHOOK_URL` | where reminders are posted for Deval to see in Grok |
| `GROK_DIAMOND_RECEIPT_WEBHOOK_AUTH` | the Authorization header value from the Grok routine panel, sent verbatim |
| `RECEIPT_CHASE_FIRST_HOURS` | optional; hours before the first reminder, 24 by default |
| `RECEIPT_CHASE_REPEAT_HOURS` | optional; hours between reminders after that, 24 by default, matching the once-a-day schedule |
| `GOOGLE_SHEET_ID` | the spreadsheet the copy is written into |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | share the sheet with this address as an Editor |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | that account's private key |
| `GOOGLE_SHEET_TAB` | optional; the design register's tab, "Design Numbers" by default |

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Running on Cloudflare

The app is a Next.js app deployed to **Cloudflare Workers** through
`@opennextjs/cloudflare`. Three things are worth knowing before touching it.

**Next.js 15 or newer is not optional.** The adapter requires `>=15.5.24`; it
dropped 14 support, which is why the framework was upgraded before any of this
could start.

**`nodejs_compat` is load-bearing.** Two things depend on it and nothing else
can provide them: `scrypt`, which every stored password was hashed with, and
`createSign`, which signs the Google Sheets service-account token. Remove the
flag and nobody can log in.

**PDFs need the Workers Paid plan.** Memo PDFs, PD sheets, demand sheets, the
jangad issue slip and the order-board PNG all render real Chrome against the
app's own pages. On a Worker there is no filesystem and nothing to launch, so
they go through Cloudflare's Browser Rendering and the `BROWSER` binding —
included on the $5/month plan, unavailable on the free one. `src/lib/memoPdf.ts`
picks the browser at run time and still works on Vercel and on a developer's
machine.

```bash
npm run cf:types     # regenerate worker-configuration.d.ts after editing wrangler.jsonc
npm run cf:preview   # build and run the Worker locally
npm run cf:deploy    # build and put it live
```

Cloudflare calls the Worker on a schedule, not a URL, so the crons land in the
`scheduled` handler in `cloudflare/worker.ts`, which maps each cron expression
to the route it presses and authenticates with `CRON_SECRET` exactly as an
outside caller would. There is no second way in. To try one locally:

```bash
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=35+2+*+*+1-6"
```

The Workers runtime types contradict the browser types every page is written
against, so they are kept to `cloudflare/`, which has its own `tsconfig.json`.
Typecheck both:

```bash
npx tsc --noEmit
npx tsc --noEmit -p cloudflare/tsconfig.json
```
