# Synchronization Engine — Naseeb Biryani POS

The sync engine keeps the browser's local SQLite WASM database and the FastAPI/PostgreSQL backend in sync, while preserving the offline-first UX.

## Design goals

1. **Offline-first**: every write is local-first (instant), then queued for sync.
2. **Non-blocking**: sync runs in the background; the UI never waits on it.
3. **Predictable conflict resolution**: last-write-wins by `updated_at` / `sync_version`, with conflicts surfaced (never silently lost).
4. **Resilient**: failed pushes are retried; the queue survives page reloads (persisted in `sync_queue` table inside the local SQLite).

## Components

### 1. Local write + enqueue (`src/lib/db/offline-db.ts`)

Every mutation (`addCategory`, `updateProduct`, `saveOrder`, `updateOrderStatus`, `updateStoreInfo`, etc.):
1. Writes the record to the local SQLite table.
2. Inserts a row into `sync_queue` with `{entity_type, entity_id, operation, payload, created_at}`.
3. Calls `persistToDisk()` → exports the SQLite binary to IndexedDB.

### 2. Connectivity monitor (`src/lib/sync/sync-engine.ts`)

- Listens to `window.online` / `window.offline` events.
- Pings `GET /api/health` (via the gateway) immediately and every **15s** (matches the original app's interval).
- Updates the global `SyncState` (`online`, `status`, `pending`, `conflicts`, `lastSyncedAt`).
- When connectivity returns and there are pending items, kicks off `runSync()`.

### 3. Push (`POST /api/sync/push`)

`runSync()` reads the entire `sync_queue`, groups items by entity type, and sends a single bulk request:

```json
{
  "changes": {
    "categories": [{"id": "10", "operation": "update", "record": {...}}, ...],
    "products": [...],
    "orders": [...],
    "store_info": [...]
  },
  "device_id": "web-client"
}
```

The server applies each record:
- **If `server.updated_at > client.updated_at` OR `sync_version` differs** → **conflict**: the server record wins, the client record is returned in `conflicts[]` (not overwritten). The UI can surface these.
- **Otherwise** → upsert the client record onto the server (set `sync_version = server.sync_version + 1`, `updated_at = now`).

Successfully-applied items are removed from the local `sync_queue`. Conflicting items stay (marked with `last_error="conflict"`) so they're visible in Settings.

### 4. Pull (`GET /api/sync/pull?since=<epoch_ms>`)

After pushing, the client pulls all server records with `updated_at > last_synced_at`:

```json
{
  "categories": [...], "products": [...], "orders": [...], "store_info": [...],
  "server_time": 1770000000000
}
```

Each pulled record is applied locally **only if `server.updated_at >= local.updated_at`** (last-write-wins). This prevents clobbering newer local edits that haven't been pushed yet. After applying, `last_synced_at` is updated to `server_time` (stored in `localStorage`).

### 5. Conflict handling

Conflict = the server has a newer version of a record than the client is trying to push.

- **Strategy**: last-write-wins by `updated_at`. The server record is authoritative.
- **No silent data loss**: conflicting client records are returned in the push response and tracked in the sync state (`syncConflicts` count, shown in Settings).
- **Why LWW?** This POS is single-device in practice (one terminal per store). Multi-device concurrent edits are rare; LWW is simple and predictable. For multi-device scenarios, the `sync_version` field supports extension to manual conflict resolution UI.

## Status states (UI indicator)

| State | Trigger | Indicator |
|-------|---------|-----------|
| `online` | `/api/health` returns 200, no pending items | `● Online` |
| `offline` | `/api/health` fails or `navigator.onLine === false` | `● Offline` |
| `syncing` | `runSync()` started | `↻ Syncing...` |
| `synced` | `runSync()` completed cleanly | `✓ Synced` |
| `sync-error` | `runSync()` threw | `⚠ Sync Error` |

The indicator also shows pending count: `Online (3)` when 3 items are queued.

## Manual sync

The Settings tab has a **"Sync Now"** button that calls `syncNow()` (push + pull) and reloads the in-memory data. Disabled when offline.

## What gets synced

| Operation | Local action | Sync queue entry | Server action |
|-----------|-------------|------------------|----------------|
| Add category/product/order | INSERT | `create` | INSERT (server assigns id; client pulls new id) |
| Update category/product/order status | UPDATE + `sync_version+1` | `update` | UPSERT (conflict-checked) |
| Delete category/product | soft-delete (`deleted_at`) | `delete` | mark `deleted_at` |
| Delete order | hard DELETE (matches original) | — (queue cleared) | hard DELETE |
| Update store_info | UPSERT + `sync_version+1` | `update` | UPSERT |
| Clear all orders | DELETE all + reset autoincrement | — (queue cleared) | DELETE all |

> Note: `deleteOrder` (hard delete) matches the original app's behavior exactly. The sync engine does not enqueue these for server-side delete — instead, the server's data is treated as authoritative and the client re-syncs. This preserves the original "permanent delete" semantics.

## Persistence

- The entire local SQLite binary is exported to **IndexedDB** (`POS_DB_Store` / `db_file` key) on every `persistToDisk()`. This survives page reloads.
- `last_synced_at` is stored in `localStorage` (`pos_last_synced_at`).
- The `sync_queue` lives inside the SQLite DB, so pending changes survive reloads too.
