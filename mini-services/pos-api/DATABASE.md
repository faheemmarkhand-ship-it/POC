# DATABASE.md — POS API Schema

## Storage backend
Default: **SQLite** at `mini-services/pos-api/pos_server.db`.

To switch to **PostgreSQL** (one-line change, no model edits):
```bash
export DATABASE_URL="postgresql+psycopg://user:pass@localhost:5432/pos"
# restart the service
```
All columns are declared with PostgreSQL-compatible SQLAlchemy types
(`BigInteger`, `Integer`, `Float`, `Text`) — no SQLite-specific types are used
in the model layer. The only SQLite-specific code is in `app/db.py` (PRAGMA
setup) and `app/repositories/orders.py::clear_all` (sqlite_sequence reset) —
both are wrapped in `try/except` so they degrade gracefully on PostgreSQL.

## Tables

### `store_info`
| column | type | notes |
|---|---|---|
| `key` | TEXT PK | config key (name, address, phone, email, receiptHeader, receiptFooter) |
| `value` | TEXT | JSON-encoded string (preserved verbatim from original app). GET endpoint parses with `json.loads`. |
| `updated_at` | BIGINT | epoch ms — set on every insert/update |
| `deleted_at` | BIGINT NULL | epoch ms; NULL = active. Soft delete. |
| `sync_version` | BIGINT DEFAULT 0 | monotonic per-row version; incremented on each update |

Mirrors original: `store_info(key TEXT PK, value TEXT)`.

### `categories`
| column | type | notes |
|---|---|---|
| `id` | BIGINT PK AUTOINCREMENT | preserved from original |
| `name` | TEXT | |
| `color` | TEXT | hex color, e.g. `#0078c2` |
| `emoji` | TEXT | emoji string |
| `position` | INTEGER DEFAULT 0 | drag-and-drop order |
| `updated_at` | BIGINT | epoch ms |
| `deleted_at` | BIGINT NULL | soft delete |
| `sync_version` | BIGINT DEFAULT 0 | |

Mirrors original: `categories(id INTEGER PK AUTOINCREMENT, name TEXT, color TEXT, emoji TEXT, position INTEGER DEFAULT 0)`.

### `products`
| column | type | notes |
|---|---|---|
| `id` | BIGINT PK AUTOINCREMENT | preserved from original |
| `name` | TEXT | |
| `category_id` | BIGINT | FK → categories.id (not enforced as DB FK; app handles) |
| `price` | FLOAT | |
| `quantity_type` | TEXT | e.g. `1 Pao`, `Dedh Pao`, `1 Kg`, `Pieces`, `Regular`, etc. |
| `is_custom` | INTEGER | 0/1 flag |
| `updated_at` | BIGINT | epoch ms |
| `deleted_at` | BIGINT NULL | soft delete |
| `sync_version` | BIGINT DEFAULT 0 | |

Mirrors original: `products(id INTEGER PK AUTOINCREMENT, name TEXT, category_id INTEGER, price REAL, quantity_type TEXT, is_custom INTEGER)`.

### `orders`
| column | type | notes |
|---|---|---|
| `id` | BIGINT PK AUTOINCREMENT | preserved from original; format `ORD-XXX` zero-padded to 3 |
| `timestamp` | BIGINT | epoch ms |
| `total` | FLOAT | |
| `status` | TEXT | `completed` \| `returned` \| `deleted` |
| `items_json` | TEXT | JSON-encoded array of cart items |
| `updated_at` | BIGINT | epoch ms |
| `deleted_at` | BIGINT NULL | soft delete marker (only set via sync; explicit hard delete for `/api/orders/{id}`) |
| `sync_version` | BIGINT DEFAULT 0 | |

Mirrors original: `orders(id INTEGER PK AUTOINCREMENT, timestamp INTEGER, total REAL, status TEXT, items_json TEXT)`.

### `items_json` structure (per cart item)
```json
{
  "id": 59,
  "name": "Chicken Tikka Biryani",
  "categoryId": 10,
  "price": 123,
  "quantityType": "Adha Kilo Double",
  "isCustom": false,
  "quantity": 1,
  "total": 123
}
```
Custom items use `id: "custom_<timestamp>"`.

## Sync metadata columns (added to all mutable tables)
| column | type | purpose |
|---|---|---|
| `updated_at` | BIGINT NOT NULL DEFAULT 0 | last-modified epoch ms; authoritative for sync comparison |
| `deleted_at` | BIGINT NULL | soft delete marker; NULL = active |
| `sync_version` | BIGINT NOT NULL DEFAULT 0 | monotonic per-row version, incremented on each update |

## Conflict resolution (sync push)
For each record with an `id` (or `key` for store_info):
- If server row exists and (`server.updated_at > incoming.updated_at` OR
  `server.sync_version != incoming.sync_version`):
  → treated as conflict; returned in `conflicts[]` list; **not** overwritten.
- Else (incoming is newer or equal): upsert applied.
- Identical records (same updated_at + sync_version) → counted as applied, no-op.

Soft-deleted records are still returned by `/api/sync/pull` so clients can sync deletes.

## Business-day shift (9-hour)
Late-night orders are grouped with the previous business day. The original app
subtracts 9 hours (9 × 3600 × 1000 ms) before computing the day bucket. The
same is applied here for:
- `/api/orders` (month/date filters)
- `/api/stats` (month/date filters)
- `/api/summary/date` (daily/monthly grouping)
- `/api/summary/category` (month filter)

Implementation uses SQLite's `strftime` on `datetime((timestamp - 9h)/1000, 'unixepoch')`.
For PostgreSQL the equivalent would be `to_char(to_timestamp((timestamp - 9*3600*1000)/1000), 'YYYY-MM-DD')`.

## Seed data
On first startup, the app imports `/home/z/my-project/upload/seed_data.json`:
- 6 store_info rows (includes Urdu text — UTF-8 preserved)
- 7 categories
- 38 products
- 4725 orders

Seed is **idempotent**: existing rows are skipped. Force a re-seed by deleting
`pos_server.db` and restarting.
