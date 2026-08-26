# Naseeb Biryani and Pakwan Center — POS System

A modernized, offline-first Point-of-Sale system migrated from a pure HTML/CSS/JavaScript + SQLite WebAssembly app into a production-ready **Next.js + FastAPI + PostgreSQL-compatible** architecture with full **offline/online synchronization**.

> **Migration source:** `POS-main V1.rar` (HTML/CSS/JS + sql.js SQLite WASM, offline-first restaurant POS).
> **Migration target:** Next.js 16 (App Router) + TypeScript frontend, FastAPI + SQLAlchemy backend, SQLite WASM (browser) offline DB, PostgreSQL-compatible online DB, sync engine.

---

## 1. Architecture Overview

```
                ┌──────────────────────────────┐
                │      Next.js 16 Frontend      │
                │   (App Router, TypeScript)    │
                └──────────────┬───────────────┘
                               │
                ┌──────────────┴───────────────┐
                │   Repository Abstraction     │
                │  (src/lib/repositories.ts)    │
                └──────────────┬───────────────┘
                       ┌───────┴────────┐
                       ▼                ▼
                 ┌──────────┐    ┌─────────────────┐
                 │ OFFLINE  │    │     ONLINE      │
                 │ SQLite   │    │  FastAPI (8001) │
                 │  WASM    │    │  + SQLAlchemy   │
                 │ (browser)│    │  + PostgreSQL*  │
                 └────┬─────┘    └────────┬────────┘
                      │                   │
                      └─────┬─────────────┘
                            ▼
                 ┌─────────────────────┐
                 │   Sync Engine       │
                 │ (src/lib/sync/)     │
                 │ queue + push/pull   │
                 └─────────────────────┘
```

*\*The backend uses SQLite as the storage engine in this sandbox (PostgreSQL is impractical to install here), but all SQLAlchemy column types are PostgreSQL-compatible. Switching to real PostgreSQL is a one-line `DATABASE_URL` change — see [DATABASE.md](./DATABASE.md).*

### Offline-first principle

Every mutation writes to the **local SQLite WASM database first** (instant, always available) and enqueues a sync entry. When the FastAPI backend is reachable, the sync engine drains the queue (push) and pulls server-side changes. The UI never blocks on the network.

---

## 2. Project Structure

```
my-project/
├── src/                          # Next.js frontend
│   ├── app/                      # App Router (layout, page, globals.css, pos.css)
│   ├── components/pos/           # POS UI components (Header, NavTabs, tabs, modals)
│   │   └── modals/               # Product, Category, Receipt, PriceAdjust, Confirm
│   ├── features/                 # Feature modules (reserved for further splitting)
│   ├── lib/
│   │   ├── db/offline-db.ts      # SQLite WASM layer (sql.js) + IndexedDB persistence
│   │   ├── sync/sync-engine.ts   # Connectivity + queue drain + pull + conflict handling
│   │   ├── api-client.ts         # Fetch wrapper (?XTransformPort=8001 gateway)
│   │   ├── repositories.ts       # Repository abstraction (UI ↔ data layer)
│   │   └── pos-utils.ts          # Business-logic helpers (qty weights, order IDs, …)
│   ├── stores/pos-store.ts      # Zustand client state (cart, tabs, data, sync status)
│   └── types/pos.ts              # Shared TS types (mirror DB schema + Pydantic)
├── public/                       # LOGO.jpg, R-LOGO.png, NB.ico, sql-wasm*.wasm, seed-data.json
├── mini-services/
│   └── pos-api/                  # FastAPI backend (port 8001)
│       ├── app/                  # main, config, db, models, schemas, repositories, services, api
│       ├── pos_server.db         # SQLite (PostgreSQL-compatible schema)
│       └── DATABASE.md / README.md
├── prisma/                       # Prisma schema (available; app uses sql.js for offline)
├── Caddyfile                     # Gateway: port 81 → 3000, with ?XTransformPort=N proxying
└── worklog.md                    # Migration audit + per-task logs
```

---

## 3. Frontend Setup (Next.js 16)

The frontend is the initialized Next.js project in the repo root.

```bash
# Install dependencies (sql.js is the only addition for the offline DB)
bun install

# Start the dev server (port 3000)
bun run dev
```

The app is served at `http://localhost:3000` (or via the gateway at port 81 in this sandbox).

### Key frontend files

| File | Purpose |
|------|---------|
| `src/app/page.tsx` | Single-page shell: Header + NavTabs + 4 tab contents + modals |
| `src/app/pos.css` | The original POS design system (17 CSS files concatenated + sticky-footer/print additions) |
| `src/lib/db/offline-db.ts` | sql.js SQLite WASM: schema, seed, CRUD, stats, sync queue |
| `src/lib/sync/sync-engine.ts` | Connectivity monitor, push (queue→server), pull (server→local), conflict handling |
| `src/lib/repositories.ts` | Repository abstraction — the UI's only data API |
| `src/stores/pos-store.ts` | Zustand store: cart, active tab, loaded data, sync status |

---

## 4. Backend Setup (FastAPI)

The backend lives in `mini-services/pos-api/` and runs on **port 8001**.

```bash
cd mini-services/pos-api

# Create a venv and install deps
uv venv .venv --python 3.12 && source .venv/bin/activate
uv pip install fastapi "uvicorn[standard]" sqlalchemy pydantic

# Run the server (auto-reload)
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

On first run, the backend seeds itself from the original `pos_data.db` export (6 store_info rows, 7 categories, 38 products, **4725 orders**).

### REST API (all under `/api`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Status + DB counts |
| GET / PUT | `/api/store-info` | Read / upsert store config |
| GET / POST | `/api/categories` | List / create categories |
| PUT / DELETE | `/api/categories/{id}` | Update / soft-delete (409 if has products) |
| PUT | `/api/categories/order` | Reorder categories by position |
| GET / POST | `/api/products` | List / create products |
| PUT / DELETE | `/api/products/{id}` | Update / soft-delete product |
| GET / POST | `/api/orders` | List (filters: status/month/date/limit/search) / create |
| PUT | `/api/orders/{id}/status` | Update order status (completed/returned/deleted) |
| DELETE | `/api/orders/{id}` | Hard-delete single order |
| DELETE | `/api/orders` | Clear all + reset autoincrement |
| GET | `/api/stats?status=&month=&date=` | Revenue / orders / returned stats (9h shift) |
| GET | `/api/summary/date?month=&scope=&year=` | Daily/monthly revenue trend |
| GET | `/api/summary/category?month=` | Sales by category + top-10 products |
| POST | `/api/sync/push` | Bulk push pending changes (conflict detection) |
| GET | `/api/sync/pull?since=` | Pull server changes since timestamp |

---

## 5. Database Schema (preserved from original)

The original SQLite schema is preserved exactly. Sync-metadata columns are added for the sync engine (documented in [DATABASE.md](./DATABASE.md)).

| Table | Original columns | Sync columns added |
|-------|------------------|--------------------|
| `store_info` | `key TEXT PK, value TEXT` | `updated_at, sync_version` |
| `categories` | `id, name, color, emoji, position` | `updated_at, deleted_at, sync_version` |
| `products` | `id, name, category_id, price, quantity_type, is_custom` | `updated_at, deleted_at, sync_version` |
| `orders` | `id, timestamp, total, status, items_json` | `updated_at, deleted_at, sync_version` |

The **9-hour business-day shift** (late-night orders grouped with the previous business day) is preserved in all stats/filtering/grouping logic, on both the frontend (`src/lib/db/offline-db.ts`) and backend (`mini-services/pos-api/app/services/stats.py`).

---

## 6. Synchronization

See [SYNC.md](./SYNC.md) for full details. In short:

1. **Offline write** → local SQLite WASM + `sync_queue` row (pending).
2. **Connectivity monitor** pings `/api/health` every 15s + on `online`/`offline` events.
3. **When online** → `runSync()`:
   - `POST /api/sync/push` sends all pending changes; server applies with **last-write-wins by `updated_at`/`sync_version`** and returns conflicts.
   - `GET /api/sync/pull?since=last_synced` pulls server-side records and applies them locally (only if server `updated_at >= local updated_at`).
4. Status indicator shows: `Online` / `Offline` / `Syncing...` / `Synced` / `Sync Error`.

---

## 7. Running Locally

### One-command (this sandbox)

Both services are already configured. The Caddy gateway (port 81) routes:
- `/` → Next.js (port 3000)
- `/?XTransformPort=8001` → FastAPI (port 8001)

```bash
# Frontend (already running)
bun run dev          # → http://localhost:3000

# Backend
cd mini-services/pos-api
.venv/bin/python -m uvicorn app.main:app --port 8001 --reload
```

Access the app via the **Preview Panel** (which uses the gateway on port 81). The `?XTransformPort=8001` query param is added automatically by `src/lib/api-client.ts` for all API calls.

### Docker (optional, for real PostgreSQL)

A `docker-compose.yml` can spin up PostgreSQL; set `POS_API_DATABASE_URL=postgresql+psycopg://user:pass@db:5432/pos` in the backend env. The SQLAlchemy models are dialect-agnostic.

---

## 8. Environment Variables

Create a `.env` (or `.env.local`) for the frontend:

```env
# Frontend (Next.js) — none required; the API port is hardcoded in api-client.ts
```

For the backend (`mini-services/pos-api/.env`):

```env
POS_API_DATABASE_URL=sqlite:///./pos_server.db   # default; switch to postgresql+psycopg://… for real PG
```

---

## 9. Data Migration (original SQLite → PostgreSQL)

The original `database/pos_data.db` was exported to `public/seed-data.json` (compact: 300 recent orders for the browser) and `upload/seed_data.json` (full: all 4725 orders for the backend). The backend's `app/services/seed.py` imports the full dataset on first run, preserving all IDs, relationships, and historical records. See [MIGRATION.md](./MIGRATION.md).

---

## 10. Documentation Index

- [ARCHITECTURE.md](./ARCHITECTURE.md) — detailed architecture & data flow
- [DATABASE.md](./DATABASE.md) — schema, sync columns, PostgreSQL switch
- [SYNC.md](./SYNC.md) — sync engine, conflict handling, status states
- [MIGRATION.md](./MIGRATION.md) — original→new feature mapping & audit
- [worklog.md](./worklog.md) — per-task migration work log

---

## 11. Feature Parity Checklist

| Feature | Original | Migrated | Verified |
|---------|----------|----------|----------|
| POS tab (products, cart, checkout) | ✅ | ✅ | ✅ |
| Category pills + search filter | ✅ | ✅ | ✅ |
| Smart product sorting (qty weights) | ✅ | ✅ | ✅ |
| Drag-and-drop category reorder | ✅ | ✅ | ✅ |
| Custom item entry | ✅ | ✅ | ✅ |
| Receipt (Customer + Counter copy, ORD-XXX, Urdu) | ✅ | ✅ | ✅ |
| Sales tab (list + filters + summary cards) | ✅ | ✅ | ✅ |
| Sales sub-tabs (completed/returned/deleted) | ✅ | ✅ | ✅ |
| 9-hour business-day shift | ✅ | ✅ | ✅ |
| Analytics (trend line, category doughnut, top products) | ✅ | ✅ | ✅ |
| Menu management (grouped cards, orphaned section) | ✅ | ✅ | ✅ |
| Product add/edit/delete modal (qty types) | ✅ | ✅ | ✅ |
| Settings (store info, receipt, category CRUD) | ✅ | ✅ | ✅ |
| Connectivity indicator | ✅ | ✅ | ✅ (online/offline/syncing) |
| Offline SQLite WASM persistence | ✅ | ✅ | ✅ (IndexedDB) |
| Online backend (FastAPI + DB) | — | ✅ | ✅ |
| Offline↔online sync engine | — | ✅ | ✅ |
| Export sales (CSV) | ✅ | ✅ | ✅ |

---

## 12. Troubleshooting

- **"Offline" indicator despite backend running:** You're accessing port 3000 directly. Use the gateway (port 81 / Preview Panel) so `?XTransformPort=8001` is proxied.
- **WASM fails to load:** Ensure `public/sql-wasm.wasm` and `public/sql-wasm-browser.wasm` exist (copied from `node_modules/sql.js/dist/`).
- **Empty Sales table:** The default month filter is the current month. Use Previous/Next or the month picker to navigate to a month with data (e.g. 2026-02 in the seed).
- **Backend won't start:** Check `mini-services/pos-api/server.log`. Re-create the venv if deps are missing.
