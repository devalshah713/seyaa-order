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
- **SQLite** for the prototype (zero setup)

## Run it locally

```bash
npm install
npm run db:reset   # creates the SQLite DB + seeds jewellery specs & a sample order
npm run dev        # http://localhost:3000
```

## Going to production (shared cloud DB for all 4 regions)

The prototype uses SQLite so it runs instantly. For a real shared database
that USA/Dubai/HK/India all use in real time:

1. Provision a cloud Postgres (e.g. Vercel Postgres, Neon, Supabase, RDS).
2. In `prisma/schema.prisma`, change the datasource `provider` from
   `"sqlite"` to `"postgresql"`.
3. Set `DATABASE_URL` to the Postgres connection string.
4. Run `npm run db:push && npm run db:seed`.
5. Deploy (Vercel recommended for Next.js).

No application code changes are needed — only the datasource.

## Ideas for next iterations

- User login / roles (admin vs staff) and audit trail of who created/edited
- Reference image upload per order (customers often send a photo)
- Admin UI to manage attributes & product types without editing the seed
- PDF export of the spec sheet
- Dashboard: orders per region, per status, revenue
- Customer history view
- Production due-date tracking & reminders
