# Architecture — Naseeb Biryani POS Migration

## High-level data flow

```
User action (click "Add to cart", "Checkout", etc.)
        │
        ▼
React component (src/components/pos/*)
        │  calls repository method
        ▼
Repository abstraction (src/lib/repositories.ts)
        │  ensureReady() → initOfflineDb()
        ▼
Offline SQLite WASM (src/lib/db/offline-db.ts)
        │  1. INSERT/UPDATE into local SQLite
        │  2. INSERT row into sync_queue
        │  3. persistToDisk() → IndexedDB blob
        ▼
maybeSync() — if online, kick off background sync
        │
        ▼
Sync engine (src/lib/sync/sync-engine.ts)
        │  runSync():
        │    1. refreshConnectivity() → GET /api/health (via gateway)
        │    2. pushPending() → POST /api/sync/push (all queue items)
        │    3. pullServerChanges() → GET /api/sync/pull?since=last_synced
        ▼
FastAPI backend (mini-services/pos-api, port 8001)
        │  - validates with Pydantic schemas
        │  - repository layer writes to SQLAlchemy models
        │  - conflict detection (updated_at / sync_version)
        ▼
Online DB (SQLite now, PostgreSQL-compatible — see DATABASE.md)
```

## Layering rules (enforced)

1. **UI components never call `fetch()` or run SQL directly.** They call `src/lib/repositories.ts`.
2. **Repository routes between offline and online** but always writes locally first (offline-first).
3. **Sync engine is isolated** in `src/lib/sync/` — no sync logic leaks into components.
4. **Types are shared** in `src/types/pos.ts` and mirror the backend Pydantic schemas + DB schema.

## Why offline-first?

The original app was 100% local (sql.js + File System Access API). Users expect the POS to work even when the network is down. Every mutation is instant locally; sync is a background concern. This also means:

- No UI blocking on network.
- If the backend is down, the POS still works.
- On reconnect, pending changes flow to the server automatically.

## State management

- **Zustand** (`src/stores/pos-store.ts`): client UI state — active tab, cart, loaded data, sync status, modals.
- **Local SQLite WASM**: the authoritative local data store (mirror of original `DataService.data`).
- **No TanStack Query needed** for the core POS: reads come from the local SQLite (synchronous-ish via sql.js), which is always fresh after sync.

## Connectivity detection

Mirrors the original app: `navigator.onLine` + a real HTTP ping every 15s. Instead of pinging Google's favicon, we ping our own `/api/health` (more meaningful — confirms the backend, not just "the internet"). States:

| State | Meaning |
|-------|---------|
| `online` | Backend reachable; no pending sync |
| `offline` | Backend unreachable; using local DB |
| `syncing` | Push/pull in progress |
| `synced` | Last sync completed cleanly |
| `sync-error` | Sync failed (network/4xx/5xx) |

## Gateway (Caddy)

The sandbox exposes a single external port via Caddy (port 81). The Caddyfile:
- `/` → `localhost:3000` (Next.js)
- `/?XTransformPort=N` → `localhost:N`

So the frontend calls the backend with relative URLs + `?XTransformPort=8001`. `src/lib/api-client.ts` adds the query param automatically. This keeps all URLs relative (no CORS, no absolute localhost:8001 in code).

## Print flow (receipt)

Preserved exactly from the original:
1. Checkout → build `pendingOrder` with `ORD-XXX` id → open Receipt modal (Customer Copy preview).
2. "Print Receipt" → `createOrder()` saves to local SQLite + enqueues sync → `window.print()` (Customer Copy) → 1s delay → `window.print()` (Counter Copy).
3. Cart cleared, orders reloaded, modal closed.

The `@media print` CSS in `pos.css` ensures only the receipt prints (everything else hidden).
