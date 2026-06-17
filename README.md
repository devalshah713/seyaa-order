# Seyaa Order Management

A web-based order management tool for a jewellery business operating across
**USA, Dubai, Hong Kong & India**. It handles the hard part of jewellery
orders — heavy per-product customization (diamond size, cut, clarity, gold
color, karat, ring size, length, engraving, etc.) — without a rigid schema.

## Why it's built this way

Every product type needs different specs. Instead of hardcoding columns,
**attributes are data**:

- **Attributes** are defined once (Gold Color, Diamond Clarity, Ring Size…),
  each with an input type (dropdown / number / text) and optional unit.
- **Product Types** (Ring, Necklace, Bracelet…) declare which attributes apply.
- The **New Order form adapts automatically** — pick "Ring" and you get ring
  fields; pick "Chain" and the diamond fields disappear.
- Adding a new spec later requires **no code or schema change** — just add a
  row (see `prisma/seed.ts` or, later, an admin screen).

Dropdowns for specs prevent inconsistent data (`18K` vs `18k` vs `18 karat`).

## Features

- Register orders with customer, region, sales person, notes
- Multiple products per order, each with its own specifications
- Order status pipeline: New → Confirmed → In Production → QC → Shipped → Delivered
- Search & filter by order #, customer, sales person, region, status
- Printable order / spec sheet for the workshop (Print button)
- Per-region currency

## Tech

- **Next.js 14** (App Router) + TypeScript
- **Google Sheets** as the order store (via a bound Google Apps Script Web App)

## How storage works

- Dropdown/reference data (regions, product types, diamond sizes/shapes,
  stone types, etc.) lives in code: `src/lib/formConfig.ts`.
- Orders are written to a Google Sheet — one row per product item, with a
  fixed column for each field (see `SHEET_HEADERS`).
- The app reads/writes the sheet through a Google Apps Script Web App
  (`google-apps-script/Code.gs`). Server-side calls only.

## How the live site is set up (Vercel)

1. Create a Google Sheet and open Extensions → Apps Script.
2. Paste `google-apps-script/Code.gs`, set `SECRET`, and Deploy → New
   deployment → Web app (Execute as: Me, Who has access: Anyone).
3. In Vercel → Settings → Environment Variables, set:
   - `SHEETS_WEBAPP_URL` — the Web App URL (ends in `/exec`)
   - `SHEETS_TOKEN` — the same secret as `SECRET` in the script
4. Redeploy. Orders now read/write to the Sheet.

## Run it locally (optional, for developers)

```bash
npm install
# set SHEETS_WEBAPP_URL and SHEETS_TOKEN in .env (optional)
npm run dev        # http://localhost:3000
```

## Ideas for next iterations

- User login / roles (admin vs staff) and audit trail of who created/edited
- Reference image upload per order (customers often send a photo)
- Admin UI to manage attributes & product types without editing the seed
- PDF export of the spec sheet
- Dashboard: orders per region, per status, revenue
- Customer history view
- Production due-date tracking & reminders
