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

Memos persist in **Vercel Blob** (a single JSON database). Set the
`BLOB_READ_WRITE_TOKEN` environment variable in Vercel (already configured for
this project). Without it, the app runs but cannot save.

## Backups

Two copies of everything, both nightly at midnight IST.

**The office PC** — the restorable one. `windows-backup\backup.ps1` runs as a
scheduled task and pulls the whole database as one JSON file, the Excel
workbooks (memos, jangad, stock book, QC) and every memo PDF into
`C:\SeyaaBackups`. It authenticates with `BACKUP_TOKEN`, so nobody has to be
signed in.

**A Google Sheet** — the readable one. Every module gets its own tab: design
numbers, PD sheets, diamond demands, the jangad register, the stock book, QC
and memos, plus a **Backup Log** tab saying when the copy last ran. Each tab is
replaced rather than appended to, so a sync that runs twice changes nothing.
Vercel's scheduler calls `/api/backup/sheets` at 18:30 UTC (`vercel.json`),
which is midnight in India; the office PC's own job calls it too, and an admin
can run it by hand from **Backups** in the top bar.

Environment variables, all set in Vercel:

| Variable | What it is for |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | the storage every module reads and writes |
| `AUTH_SECRET` | signs the session cookie |
| `BACKUP_TOKEN` | lets the office PC download without a login |
| `CRON_SECRET` | lets Vercel's scheduler call the nightly sheet copy |
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
