// src/lib/sync/sync-engine.ts
// Synchronization engine: drains the local sync queue to the FastAPI backend when online,
// and pulls server changes into the local SQLite. Handles conflicts via updated_at/sync_version.
//
// Flow (offline-first):
//   UI mutation → local SQLite + sync_queue row (pending)
//   On reconnect / background tick → runSync():
//     1. POST /api/sync/push  (all pending changes; server applies with conflict detection)
//     2. GET  /api/sync/pull?since=last_synced  (apply server records into local DB)
//     3. Clear applied queue items; mark failed ones with attempts++

import { getDb, getSyncQueue, clearSyncQueueItem, markSyncQueueError, clearSyncQueue, applyPulledRecord, persistToDisk } from "@/lib/db/offline-db";
import { api } from "@/lib/api-client";
import type { SyncStatus, SyncPushResult, SyncPullResult, SyncEntityType } from "@/types/pos";

const LAST_SYNC_KEY = "pos_last_synced_at";

interface SyncState {
  online: boolean;
  status: SyncStatus;
  lastSyncedAt: number | null;
  pending: number;
  conflicts: number;
}

let state: SyncState = {
  online: typeof navigator !== "undefined" ? navigator.onLine : true,
  status: "offline",
  lastSyncedAt: null,
  pending: 0,
  conflicts: 0,
};

const listeners = new Set<(s: SyncState) => void>();

export function getSyncState(): SyncState {
  return { ...state };
}

export function setSyncState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function subscribeSync(listener: (s: SyncState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function getLastSyncedAt(): number {
  if (state.lastSyncedAt) return state.lastSyncedAt;
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(LAST_SYNC_KEY) : null;
  const n = stored ? Number(stored) : 0;
  state.lastSyncedAt = n;
  return n;
}

function setLastSyncedAt(t: number) {
  state.lastSyncedAt = t;
  if (typeof localStorage !== "undefined") localStorage.setItem(LAST_SYNC_KEY, String(t));
}

// ---------- Connectivity detection ----------
// The original app used navigator.onLine + a HEAD fetch to google favicon every 15s.
// We do the same but ping our FastAPI backend (more meaningful for this app).

async function checkBackendReachable(): Promise<boolean> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    await api.get("/api/health");
    clearTimeout(t);
    return true;
  } catch {
    return false;
  }
}

export async function refreshConnectivity(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setSyncState({ online: false, status: "offline" });
    return false;
  }
  const ok = await checkBackendReachable();
  if (ok) {
    setSyncState({ online: true, status: state.status === "syncing" ? "syncing" : "online" });
  } else {
    setSyncState({ online: false, status: "offline" });
  }
  return ok;
}

// ---------- Sync run ----------

let syncing = false;

export async function runSync(): Promise<void> {
  if (syncing) return;
  // Try to sync directly — don't block on a separate connectivity check.
  // The push/pull will fail gracefully if the server is unreachable.
  syncing = true;
  setSyncState({ status: "syncing", online: true });
  try {
    await pushPending();
    await pullServerChanges();
    setSyncState({ status: "synced", online: true });
  } catch (e) {
    console.error("[sync] failed:", e);
    setSyncState({ status: "sync-error", online: true });
  } finally {
    syncing = false;
  }
}

async function pushPending(): Promise<void> {
  const items = getSyncQueue();
  if (items.length === 0) return;

  // Group by entity type + bundle into a single push request.
  const changes: Record<SyncEntityType, unknown[]> = {
    categories: [],
    products: [],
    orders: [],
    store_info: [],
  };
  for (const item of items) {
    let payload: unknown = null;
    try {
      payload = JSON.parse(item.payload);
    } catch {}
    changes[item.entity_type].push({
      id: item.entity_id,
      operation: item.operation,
      record: payload,
    });
  }

  const result = await api.post<SyncPushResult>("/api/sync/push", {
    changes,
    device_id: "web-client",
  });

  // Clear successfully-applied items; keep conflicts (server returns them, we surface to UI).
  const conflictIds = new Set(
    result.conflicts.map((c) => String(c.entity_id))
  );
  for (const item of items) {
    if (!conflictIds.has(String(item.entity_id))) {
      clearSyncQueueItem(item.id!);
    } else {
      markSyncQueueError(item.id!, "conflict");
    }
  }

  setSyncState({ conflicts: result.conflicts.length });
}

async function pullServerChanges(): Promise<void> {
  const since = getLastSyncedAt();
  const result = await api.get<SyncPullResult>("/api/sync/pull", { since: String(since) });

  // Apply server records. We only apply if the server record is newer than the local one
  // (or the local record isn't pending in the queue) to avoid clobbering local edits.
  const db = getDb();
  if (!db) return;

  const applyIfNewer = async (entityType: SyncEntityType, record: any) => {
    // Check local updated_at vs server updated_at
    let localUpdated = 0;
    try {
      const tableMap: Record<SyncEntityType, { table: string; pk: string; col: string }> = {
        categories: { table: "categories", pk: "id", col: "id" },
        products: { table: "products", pk: "id", col: "id" },
        orders: { table: "orders", pk: "id", col: "id" },
        store_info: { table: "store_info", pk: "key", col: "key" },
      };
      const m = tableMap[entityType];
      const res = db.exec(`SELECT updated_at FROM ${m.table} WHERE ${m.col} = ?`, [record[m.col] ?? record.id]);
      if (res.length) localUpdated = Number(res[0].values[0][0]) || 0;
    } catch {}
    const serverUpdated = Number(record.updated_at) || 0;
    // Apply server record if it's newer than local (last-write-wins by updated_at).
    if (serverUpdated >= localUpdated) {
      await applyPulledRecord(entityType, record);
    }
  };

  for (const r of result.categories) await applyIfNewer("categories", r);
  for (const r of result.products) await applyIfNewer("products", r);
  for (const r of result.orders) await applyIfNewer("orders", r);
  for (const r of result.store_info) await applyIfNewer("store_info", r);

  setLastSyncedAt(result.server_time);
  await persistToDisk();
}

// Clear all conflicts + queue (admin action).
export async function resetSyncQueue(): Promise<void> {
  await clearSyncQueue();
  setSyncState({ conflicts: 0 });
}

// ---------- Connectivity monitoring (auto) ----------

let monitorStarted = false;
export function startConnectivityMonitor(): void {
  if (monitorStarted || typeof window === "undefined") return;
  monitorStarted = true;

  window.addEventListener("online", () => {
    refreshConnectivity().then((ok) => {
      if (ok) runSync().catch(() => {});
    });
  });
  window.addEventListener("offline", () => {
    setSyncState({ online: false, status: "offline" });
  });

  // Initial check + periodic (every 15s, like the original app).
  refreshConnectivity().then((ok) => {
    if (ok) runSync().catch(() => {});
  });
  setInterval(() => {
    refreshConnectivity().then((ok) => {
      if (ok && getPendingCount() > 0) runSync().catch(() => {});
    });
  }, 15000);
}

// Avoid circular import: getPendingCount is re-exported here for convenience.
import { getPendingSyncCount } from "@/lib/db/offline-db";
export function getPendingCount(): number {
  return getPendingSyncCount();
}
