# Naseeb Biryani and Pakwan Center — POS System

A modern, offline-first Point-of-Sale system built with **Next.js** (App Router) + **Supabase (PostgreSQL)**. Deployable as a **single Vercel project** — frontend + API routes under the same domain.

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Next.js App (Vercel)                │
│  ┌────────────────────┐  ┌────────────────────┐  │
│  │   Frontend (React) │  │  API Routes /api/* │  │
│  │   - POS / Sales    │  │  - /api/health     │  │
│  │   - Menu / Settings│  │  - /api/orders     │  │
│  │   - Offline SQLite │  │  - /api/sync/*     │  │
│  │     (IndexedDB)    │  │  - /api/stats      │  │
│  └─────────┬──────────┘  └─────────┬──────────┘  │
│            │ writes local-first     │ reads/writes│
│            ▼                       ▼             │
│  ┌─────────────────┐    ┌─────────────────────┐ │
│  │  SQLite WASM    │    │  Supabase REST API  │ │
│  │  (browser)      │◄──►│  (PostgreSQL)       │ │
│  │  + sync queue   │    │                     │ │
│  └─────────────────┘    └─────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Offline-first
- Every write goes to the **local SQLite WASM** (IndexedDB) first — instant, always available.
- Changes are queued in a `sync_queue` table.
- When online, the sync engine pushes queued changes to **Supabase** and pulls server-side updates.
- Conflict resolution: **last-write-wins** by `updated_at` + `sync_version`.

## Quick Start (Local Development)

```bash
# 1. Install dependencies
bun install

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 3. Run the dev server
bun run dev
```

The app runs at `http://localhost:3000`. API routes are at `/api/*`.

## Vercel Deployment

### Prerequisites
1. A [Supabase](https://supabase.com) project with PostgreSQL.
2. The schema pushed (run `mini-services/pos-api/push_schema.py` once, or paste `mini-services/pos-api/supabase_schema.sql` into the Supabase SQL Editor).

### Steps

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Naseeb POS — Vercel-ready"
   git branch -M main
   git remote add origin https://github.com/faheemmarkhand-ship-it/POC.git
   git push -u origin main
   ```

2. **Import to Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import the `faheemmarkhand-ship-it/POC` repository
   - Framework preset: **Next.js** (auto-detected)
   - Root directory: `./` (default)
   - Build command: `bun run build` (auto-detected)
   - Install command: `bun install` (auto-detected)

3. **Set Environment Variables** (Dashboard → Settings → Environment Variables):

   | Variable | Value | Notes |
   |----------|-------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://tiybeuglcubkndufyisp.supabase.co` | Client-safe |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_pqBNliqYZs1hTq-O4Cb4ow_wEZIABye` | Anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | *(your service role key)* | Server-only, find in Supabase Dashboard → Settings → API |

4. **Deploy.** Vercel builds the Next.js app + API routes as serverless functions.

### Environment Variables Summary

```
NEXT_PUBLIC_SUPABASE_URL=https://tiybeuglcubkndufyisp.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_pqBNliqYZs1hTq-O4Cb4ow_wEZIABye
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

## API Endpoints (all under `/api/*`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Status + DB counts |
| GET / PUT | `/api/store-info` | Read / upsert store config |
| GET / POST | `/api/categories` | List / create categories |
| PUT / DELETE | `/api/categories/[id]` | Update / soft-delete |
| PUT | `/api/categories/order` | Reorder categories |
| GET / POST | `/api/products` | List / create products |
| PUT / DELETE | `/api/products/[id]` | Update / soft-delete |
| GET / POST | `/api/orders` | List (filters) / create |
| PUT | `/api/orders/[id]/status` | Update order status |
| DELETE | `/api/orders/[id]` | Hard delete single order |
| DELETE | `/api/orders/all` | Clear all orders |
| GET | `/api/stats` | Revenue / orders / returned stats |
| GET | `/api/summary/date` | Daily/monthly revenue trend |
| GET | `/api/summary/category` | Sales by category + top products |
| POST | `/api/sync/push` | Push queued changes (conflict detection) |
| GET | `/api/sync/pull` | Pull server changes since timestamp |

## Database Schema

PostgreSQL tables (in Supabase):
- `store_info(key TEXT PK, value TEXT, updated_at, deleted_at, sync_version)`
- `categories(id BIGSERIAL PK, name, color, emoji, position, updated_at, deleted_at, sync_version)`
- `products(id BIGSERIAL PK, name, category_id, price, quantity_type, is_custom, updated_at, deleted_at, sync_version)`
- `orders(id BIGSERIAL PK, timestamp, total, status, items_json, updated_at, deleted_at, sync_version)`

RLS is enabled with permissive policies (anon key can read/write).

## PWA / Offline

- `public/manifest.json` — installable on mobile (Add to Home Screen)
- `public/sw.js` — service worker caches the app shell for offline boot
- `public/sql-wasm.wasm` — SQLite WebAssembly binary (browser offline DB)
- `public/seed-data.json` — initial seed data for first offline load

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS, Zustand, Recharts, sql.js
- **API**: Next.js API Routes (serverless functions on Vercel)
- **Database**: Supabase (PostgreSQL) + Supabase JS client
- **Offline**: SQLite WebAssembly (sql.js) + IndexedDB persistence + sync queue
