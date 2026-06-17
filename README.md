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
- **Prisma** ORM
- **PostgreSQL** (a shared cloud database so all 4 regions see the same data)

## How the live site is set up (Vercel)

1. Deploy the project to Vercel.
2. In the Vercel project, connect a Postgres database (Storage tab) — this
   provides the `DATABASE_URL` environment variable automatically.
3. Redeploy. The build runs `prisma db push`, which creates all the tables.
4. Visit `/api/setup` once to load the jewellery reference data (regions,
   attributes, product types) and a sample order. It is safe to re-run.

## Run it locally (optional, for developers)

Local dev needs a PostgreSQL database. Point `DATABASE_URL` in `.env` at it,
then:

```bash
npm install
npm run db:push    # create tables
npm run db:seed    # load jewellery specs & a sample order
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
