# POS API — FastAPI Backend Mini-Service

Online authoritative database + REST APIs + sync endpoints for the Next.js POS frontend.
Runs on **port 8001**.

## Stack
- Python 3.12 (venv)
- FastAPI + Uvicorn (with `--reload`)
- SQLAlchemy 2.0 (sync API)
- SQLite storage (PostgreSQL-compatible types — one-line `DATABASE_URL` switch)
- Pydantic v2 schemas

## Layout
```
mini-services/pos-api/
  index.py              # entry: runs uvicorn app.main:app --port 8001 --reload
  requirements.txt
  pyproject.toml
  README.md             # this file
  DATABASE.md           # schema + sync columns + PostgreSQL switch note
  pos_server.db         # SQLite DB file (created on first run; auto-seeded)
  server.log            # uvicorn output (when started with nohup)
  .venv/                # python venv
  app/
    __init__.py
    main.py             # FastAPI app + CORS + startup seed
    config.py           # settings (DATABASE_URL, SEED_DATA_PATH, etc.)
    db.py               # SQLAlchemy engine/session, Base
    models.py           # ORM models
    schemas.py          # Pydantic schemas
    utils.py            # helpers (now_ms)
    api/routes.py       # all routers
    repositories/
      store_info.py
      categories.py
      products.py
      orders.py
      stats.py
      sync.py
    services/
      seed.py           # imports /home/z/my-project/upload/seed_data.json on first run
      stats.py          # 9-hour business-day shift logic
```

## Quick start
```bash
cd /home/z/my-project/mini-services/pos-api

# First-time setup (only once):
uv venv .venv --python 3.12
source .venv/bin/activate
uv pip install fastapi "uvicorn[standard]" sqlalchemy pydantic

# Run (dev, with auto-reload):
source .venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

# Or, run in the background:
nohup .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload \
  > server.log 2>&1 &
```

On startup, the app:
1. Creates tables (if missing).
2. Runs the seed service (idempotent) — imports `upload/seed_data.json`:
   - 6 store_info rows
   - 7 categories
   - 38 products
   - 4725 orders

## Verification
```bash
curl http://localhost:8001/api/health
curl http://localhost:8001/api/store-info
curl http://localhost:8001/api/categories
curl http://localhost:8001/api/products
curl "http://localhost:8001/api/orders?limit=3"
curl http://localhost:8001/api/stats
curl "http://localhost:8001/api/stats?month=2025-01"
curl "http://localhost:8001/api/summary/date?month=2025-01&scope=month"
curl "http://localhost:8001/api/summary/category?month=2025-01"
curl "http://localhost:8001/api/sync/pull?since=0"
```

Interactive API docs: http://localhost:8001/docs

## API surface (all under `/api`)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Health + DB counts |
| GET | `/api/store-info` | All store_info (parsed values) |
| PUT | `/api/store-info` | Upsert key/values |
| GET | `/api/categories` | List categories (sorted) |
| POST | `/api/categories` | Create |
| PUT | `/api/categories/{id}` | Update |
| DELETE | `/api/categories/{id}` | Soft delete (409 if has products) |
| PUT | `/api/categories/order` | Reorder |
| GET | `/api/products` | List |
| POST | `/api/products` | Create |
| PUT | `/api/products/{id}` | Update |
| DELETE | `/api/products/{id}` | Soft delete |
| GET | `/api/orders` | List w/ filters (status/month/date/search/limit) |
| POST | `/api/orders` | Create |
| PUT | `/api/orders/{id}/status` | Update status |
| DELETE | `/api/orders/{id}` | Hard delete |
| DELETE | `/api/orders` | Clear all + reset autoincrement |
| GET | `/api/stats` | Revenue/orders/returned stats |
| GET | `/api/summary/date` | Date summary (daily/monthly) |
| GET | `/api/summary/category` | Category + top-10 products |
| POST | `/api/sync/push` | Push changes w/ conflict detection |
| GET | `/api/sync/pull?since=` | Pull all changes since epoch ms |

## Caddy gateway
The frontend (Next.js on :3000) calls this backend via relative URL with
`?XTransformPort=8001`:

```js
fetch('/api/products?XTransformPort=8001')
```

The Caddyfile at `/home/z/my-project/Caddyfile` proxies `localhost:8001` when
that query parameter is present. CORS is also enabled (allow all origins) as a
belt-and-braces measure.

## Caveats
- `sqlite_sequence` is updated on seed completion so new orders continue past id 4725.
- The 9-hour business-day shift is applied to **month/date filters** on orders and stats,
  exactly like the original app (timestamp - 9*3600*1000 before grouping by day/month).
- `DELETE /api/orders/{id}` is a **hard delete** (matches original `deleteOrder`).
  `DELETE /api/orders` (no id) clears all + resets autoincrement (matches original
  `clearAllOrders`).
- Soft deletes are used for categories/products (set `deleted_at`).
- Sync conflict rule: server `updated_at` strictly newer than incoming, OR
  `sync_version` differs → conflict (returned in `conflicts[]`, not overwritten).
