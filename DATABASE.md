# Database — Naseeb Biryani POS

The schema is **preserved from the original SQLite POS app**. Only sync-metadata columns are added (clearly documented below) to support the offline↔online sync engine. No business columns were renamed or restructured.

## Original SQLite schema (source of truth)

```sql
CREATE TABLE store_info (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, color TEXT, emoji TEXT,
  position INTEGER DEFAULT 0
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT, category_id INTEGER, price REAL,
  quantity_type TEXT, is_custom INTEGER
);
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER, total REAL, status TEXT, items_json TEXT
);
```

## Migrated schema (PostgreSQL-compatible, with sync metadata)

The same logical schema, expressed with PostgreSQL-friendly types, plus sync columns. This is used by **both** the browser SQLite WASM (`src/lib/db/offline-db.ts`) and the FastAPI/SQLAlchemy backend (`mini-services/pos-api/app/models.py`).

```sql
-- store_info: key/value config (never soft-deleted; keys are upserted)
CREATE TABLE store_info (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at BIGINT DEFAULT 0,      -- sync: epoch ms
  sync_version BIGINT DEFAULT 0     -- sync: incremented each update
);

CREATE TABLE categories (
  id BIGINT PRIMARY KEY AUTOINCREMENT,  -- INTEGER PK on SQLite, BIGINT PK on PostgreSQL
  name TEXT,
  color TEXT,
  emoji TEXT,
  position INTEGER DEFAULT 0,
  updated_at BIGINT DEFAULT 0,
  deleted_at BIGINT,                    -- sync: soft-delete marker (epoch ms, NULL = active)
  sync_version BIGINT DEFAULT 0
);

CREATE TABLE products (
  id BIGINT PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  category_id BIGINT,
  price FLOAT,
  quantity_type TEXT,
  is_custom INTEGER,
  updated_at BIGINT DEFAULT 0,
  deleted_at BIGINT,
  sync_version BIGINT DEFAULT 0
);

CREATE TABLE orders (
  id BIGINT PRIMARY KEY AUTOINCREMENT,
  timestamp BIGINT,        -- epoch ms
  total FLOAT,
  status TEXT,             -- 'completed' | 'returned' | 'deleted'
  items_json TEXT,         -- JSON array of order items
  updated_at BIGINT DEFAULT 0,
  deleted_at BIGINT,
  sync_version BIGINT DEFAULT 0
);

-- Sync queue (frontend-only; tracks pending offline writes)
CREATE TABLE sync_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT,        -- 'categories' | 'products' | 'orders' | 'store_info'
  entity_id TEXT,
  operation TEXT,          -- 'create' | 'update' | 'delete'
  payload TEXT,            -- JSON of the record
  created_at INTEGER,
  attempts INTEGER DEFAULT 0,
  last_error TEXT
);
```

## SQLite ↔ PostgreSQL compatibility mapping

| Original SQLite | PostgreSQL-equivalent (SQLAlchemy) | Notes |
|-----------------|------------------------------------|-------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `BigInteger().with_variant(Integer(), "sqlite")` | Autoincrements on both; BIGINT on PG |
| `TEXT` | `Text` | Identical semantics |
| `REAL` | `Float` | Identical |
| `INTEGER` (boolean) | `Integer` | 0/1 flags |
| `INTEGER` (epoch ms) | `BigInteger` | Timestamps |

## Switching to real PostgreSQL

The backend uses SQLite by default (`POS_API_DATABASE_URL=sqlite:///./pos_server.db`). To use PostgreSQL:

1. Run a PostgreSQL instance (e.g. `docker run -e POSTGRES_PASSWORD=secret -p 5432:5432 postgres:16`).
2. Set the env var: `POS_API_DATABASE_URL=postgresql+psycopg://user:secret@localhost:5432/pos`.
3. Restart the backend — SQLAlchemy creates the tables on startup; the seed script imports the original data.

No code changes required. The models are written with `with_variant` so PKs autoincrement correctly on both dialects.

## The 9-hour business-day shift

A critical business rule from the original app: **late-night orders are grouped with the previous business day**. A 9-hour shift is applied before any date grouping/filtering:

```sql
-- Frontend (offline-db.ts) & backend (stats.py)
strftime('%Y-%m-%d', datetime((timestamp - 9*3600*1000) / 1000, 'unixepoch', 'localtime'))
```

This is applied to: stats (revenue/orders/returned), sales table month/date filters, summary-by-date grouping, and summary-by-category. Both layers implement it identically.

## Seed data

- **Frontend** (`public/seed-data.json`): compact export — all `store_info`, `categories`, `products`, and the **300 most recent orders**. Keeps the browser bundle small while providing realistic offline data.
- **Backend** (`upload/seed_data.json`): full export — all **4725 orders** + 38 products + 7 categories + 6 store_info keys. Imported by `app/services/seed.py` on first backend run.

After the first sync, the frontend pulls the full server dataset into the local SQLite WASM (the sync engine applies server records with `updated_at >= local updated_at`).
