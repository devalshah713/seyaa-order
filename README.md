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

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000.
