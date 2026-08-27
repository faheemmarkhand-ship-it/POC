// src/lib/db/offline-db.ts
// Offline SQLite WASM database layer (browser-side).
// Mirrors the original POS app's sql.js usage + IndexedDB persistence (OPFS-aware).
// Preserves the original SQLite schema exactly, plus sync-metadata columns for the sync engine.

import type {
  Category,
  Order,
  OrderItem,
  Product,
  StoreInfo,
  Stats,
  StatsFilters,
  DateSummaryPoint,
  DateSummaryFilters,
  CategorySummary,
  CategorySummaryFilters,
  SyncQueueItem,
  SyncEntityType,
} from "@/types/pos";
import { BUSINESS_SHIFT_MS } from "@/types/pos";

const IDB_NAME = "POS_DB_Store";
const IDB_STORE = "db_file";
const DB_BLOB_KEY = "pos_db_bytes";

let SQL: any = null;
let db: any = null;

// Schema mirrors the original SQLite POS app + sync metadata columns.
// Original business columns are preserved exactly; sync columns are added for the sync engine.
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS store_info (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER DEFAULT 0,
    sync_version INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    color TEXT,
    emoji TEXT,
    position INTEGER DEFAULT 0,
    updated_at INTEGER DEFAULT 0,
    deleted_at INTEGER,
    sync_version INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category_id INTEGER,
    price REAL,
    quantity_type TEXT,
    is_custom INTEGER,
    updated_at INTEGER DEFAULT 0,
    deleted_at INTEGER,
    sync_version INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp INTEGER,
    total REAL,
    status TEXT,
    items_json TEXT,
    updated_at INTEGER DEFAULT 0,
    deleted_at INTEGER,
    sync_version INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sync_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT,
    entity_id TEXT,
    operation TEXT,
    payload TEXT,
    created_at INTEGER,
    attempts INTEGER DEFAULT 0,
    last_error TEXT
  );
`;

async function loadSqlJs(): Promise<any> {
  if (SQL) return SQL;
  // @ts-ignore - sql.js is imported dynamically on the client only
  const initSqlJs = (await import("sql.js")).default;
  SQL = await initSqlJs({ locateFile: (file: string) => `/${file}` });
  return SQL;
}

// ---------- IndexedDB helpers (persist the DB binary blob) ----------

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const idb = (e.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) idb.createObjectStore(IDB_STORE);
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = (e) => reject((e.target as IDBOpenDBRequest).error);
  });
}

async function idbGet(key: string): Promise<Uint8Array | null> {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: Uint8Array): Promise<void> {
  const idb = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Public API ----------

export async function initOfflineDb(): Promise<boolean> {
  if (db) return true;
  const sql = await loadSqlJs();
  const stored = await idbGet(DB_BLOB_KEY);
  if (stored && stored.byteLength > 0) {
    db = new sql.Database(stored);
    ensureSchema();
    return true;
  }
  // No persisted DB: create fresh + seed from public/seed-data.json
  db = new sql.Database();
  ensureSchema();
  await seedFromBundle();
  await persistToDisk();
  return true;
}

function ensureSchema() {
  // Create tables if missing (with sync columns)
  db.run(SCHEMA_SQL);
  // Light migrations: add missing columns defensively
  const ensureCol = (table: string, col: string, def: string) => {
    try {
      const res = db.exec(`PRAGMA table_info(${table})`);
      const cols = res.length ? res[0].values.map((r: any[]) => r[1]) : [];
      if (!cols.includes(col)) {
        db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        console.log(`[db] Added column ${col} to ${table}`);
      }
    } catch (e) {
      console.warn(`[db] ensureCol(${table}, ${col}) failed:`, e);
    }
  };
  ensureCol("categories", "position", "INTEGER DEFAULT 0");
  ensureCol("categories", "updated_at", "INTEGER DEFAULT 0");
  ensureCol("categories", "deleted_at", "INTEGER");
  ensureCol("categories", "sync_version", "INTEGER DEFAULT 0");
  ensureCol("products", "updated_at", "INTEGER DEFAULT 0");
  ensureCol("products", "deleted_at", "INTEGER");
  ensureCol("products", "sync_version", "INTEGER DEFAULT 0");
  ensureCol("orders", "updated_at", "INTEGER DEFAULT 0");
  ensureCol("orders", "deleted_at", "INTEGER");
  ensureCol("orders", "sync_version", "INTEGER DEFAULT 0");
  ensureCol("store_info", "updated_at", "INTEGER DEFAULT 0");
  ensureCol("store_info", "sync_version", "INTEGER DEFAULT 0");
  ensureCol("store_info", "deleted_at", "INTEGER");

  // Debug: verify store_info columns
  try {
    const siRes = db.exec("PRAGMA table_info(store_info)");
    if (siRes.length) {
      const siCols = siRes[0].values.map((r: any[]) => r[1]);
      console.log("[db] store_info columns:", siCols.join(", "));
    } else {
      console.log("[db] store_info table NOT FOUND — creating fresh");
      db.run(`CREATE TABLE IF NOT EXISTS store_info (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER DEFAULT 0,
        deleted_at INTEGER,
        sync_version INTEGER DEFAULT 0
      )`);
    }
  } catch (e) {
    console.error("[db] store_info schema check failed:", e);
  }
}

async function seedFromBundle() {
  try {
    const res = await fetch("/seed-data.json");
    if (!res.ok) return;
    const data = await res.json();
    const now = Date.now();

    // store_info
    if (data.store_info?.rows) {
      const stmt = db.prepare(
        "INSERT OR REPLACE INTO store_info (key, value, updated_at, sync_version) VALUES (?, ?, ?, 1)"
      );
      for (const r of data.store_info.rows) {
        stmt.run([r[0], String(r[1]), now]);
      }
      stmt.free();
    }

    // categories
    if (data.categories?.rows) {
      const stmt = db.prepare(
        "INSERT INTO categories (id, name, color, emoji, position, updated_at, sync_version) VALUES (?, ?, ?, ?, ?, ?, 1)"
      );
      for (const r of data.categories.rows) {
        stmt.run([r[0], r[1], r[2], r[3], r[4] ?? 0, now]);
      }
      stmt.free();
    }

    // products
    if (data.products?.rows) {
      const stmt = db.prepare(
        "INSERT INTO products (id, name, category_id, price, quantity_type, is_custom, updated_at, sync_version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)"
      );
      for (const r of data.products.rows) {
        stmt.run([r[0], r[1], r[2], r[3], r[4], r[5] ?? 0, now]);
      }
      stmt.free();
    }

    // orders
    if (data.orders?.rows) {
      const stmt = db.prepare(
        "INSERT INTO orders (id, timestamp, total, status, items_json, updated_at, sync_version) VALUES (?, ?, ?, ?, ?, ?, 1)"
      );
      for (const r of data.orders.rows) {
        stmt.run([r[0], r[1], r[2], r[3], r[4], now]);
      }
      stmt.free();
    }
  } catch (e) {
    console.error("Seed failed:", e);
  }
}

export async function persistToDisk(): Promise<void> {
  if (!db) return;
  try {
    const bytes = db.export();
    await idbSet(DB_BLOB_KEY, bytes);
  } catch (e) {
    console.error("Persist to disk failed:", e);
  }
}

export function getDb() {
  return db;
}

// ---------- Data load (mirrors original DataService.loadData) ----------

export interface OfflineData {
  store: StoreInfo;
  categories: Category[];
  products: Product[];
  orders: Order[];
}

export function loadAllData(): OfflineData {
  const store: StoreInfo = {};
  // store_info is never soft-deleted (keys are upserted); no deleted_at column on this table.
  const sRes = db.exec("SELECT key, value FROM store_info");
  if (sRes.length) {
    for (const [k, v] of sRes[0].values) {
      try {
        (store as any)[k] = JSON.parse(v);
      } catch {
        (store as any)[k] = v;
      }
    }
  }

  const catRes = db.exec("SELECT id, name, color, emoji, position FROM categories WHERE deleted_at IS NULL");
  const categories: Category[] = catRes.length
    ? catRes[0].values
        .map((r: any[]) => ({
          id: r[0],
          name: r[1],
          color: r[2],
          emoji: r[3],
          position: r[4] || 0,
        }))
        .sort((a: Category, b: Category) => (a.position || 0) - (b.position || 0))
    : [];

  const prodRes = db.exec(
    "SELECT id, name, category_id, price, quantity_type, is_custom FROM products WHERE deleted_at IS NULL"
  );
  const products: Product[] = prodRes.length
    ? prodRes[0].values.map((r: any[]) => ({
        id: r[0],
        name: r[1],
        categoryId: r[2],
        price: Number(r[3]) || 0,
        quantityType: r[4],
        isCustom: !!r[5],
      }))
    : [];

  const ordRes = db.exec(
    "SELECT id, timestamp, total, status, items_json FROM orders WHERE deleted_at IS NULL ORDER BY timestamp DESC LIMIT 5000"
  );
  const orders: Order[] = ordRes.length
    ? ordRes[0].values.map((r: any[]) => {
        let items: OrderItem[] = [];
        try {
          items = JSON.parse(r[4]);
        } catch {}
        return {
          id: r[0],
          timestamp: r[1],
          total: Number(r[2]) || 0,
          status: r[3],
          items,
        };
      })
    : [];

  return { store, categories, products, orders };
}

// ---------- CRUD (mirrors original DataService mutation methods) ----------

const now = () => Date.now();

export async function addCategory(cat: {
  name: string;
  color: string;
  emoji: string;
}): Promise<number> {
  const t = now();
  db.run(
    "INSERT INTO categories (name, color, emoji, position, updated_at, sync_version) VALUES (?, ?, ?, 0, ?, 1)",
    [cat.name, cat.color, cat.emoji, t]
  );
  const res = db.exec("SELECT last_insert_rowid()");
  const id = res[0].values[0][0];
  await enqueueSync("categories", id, "create", { id, ...cat, position: 0 });
  await persistToDisk();
  return id;
}

export async function updateCategory(cat: Category): Promise<void> {
  const t = now();
  db.run(
    "UPDATE categories SET name = ?, color = ?, emoji = ?, updated_at = ?, sync_version = sync_version + 1 WHERE id = ?",
    [cat.name, cat.color, cat.emoji, t, cat.id]
  );
  await enqueueSync("categories", cat.id, "update", cat);
  await persistToDisk();
}

export async function deleteCategory(id: number): Promise<void> {
  const t = now();
  db.run(
    "UPDATE categories SET deleted_at = ?, updated_at = ?, sync_version = sync_version + 1 WHERE id = ?",
    [t, t, id]
  );
  await enqueueSync("categories", id, "delete", { id });
  await persistToDisk();
}

export async function updateCategoryOrder(idOrderMap: Record<string, number>): Promise<void> {
  const t = now();
  for (const [id, pos] of Object.entries(idOrderMap)) {
    db.run("UPDATE categories SET position = ?, updated_at = ? WHERE id = ?", [pos, t, id]);
    await enqueueSync("categories", id, "update", { id, position: pos });
  }
  await persistToDisk();
}

export async function addProduct(p: {
  name: string;
  categoryId: number | string;
  price: number;
  quantityType: string;
  isCustom: boolean;
}): Promise<number> {
  const t = now();
  db.run(
    "INSERT INTO products (name, category_id, price, quantity_type, is_custom, updated_at, sync_version) VALUES (?, ?, ?, ?, ?, ?, 1)",
    [p.name, parseInt(String(p.categoryId)), p.price || 0, p.quantityType || "pcs", p.isCustom ? 1 : 0, t]
  );
  const res = db.exec("SELECT last_insert_rowid()");
  const id = res[0].values[0][0];
  await enqueueSync("products", id, "create", { id, ...p });
  await persistToDisk();
  return id;
}

export async function updateProduct(p: Product): Promise<void> {
  const t = now();
  db.run(
    "UPDATE products SET name = ?, category_id = ?, price = ?, quantity_type = ?, is_custom = ?, updated_at = ?, sync_version = sync_version + 1 WHERE id = ?",
    [p.name, parseInt(String(p.categoryId)), p.price || 0, p.quantityType || "pcs", p.isCustom ? 1 : 0, t, p.id]
  );
  await enqueueSync("products", p.id, "update", p);
  await persistToDisk();
}

export async function deleteProduct(id: number): Promise<void> {
  const t = now();
  db.run(
    "UPDATE products SET deleted_at = ?, updated_at = ?, sync_version = sync_version + 1 WHERE id = ?",
    [t, t, id]
  );
  await enqueueSync("products", id, "delete", { id });
  await persistToDisk();
}

export async function saveOrder(order: {
  timestamp?: number;
  total: number;
  status: string;
  items: OrderItem[];
}): Promise<number> {
  const t = now();
  const ts = order.timestamp || t;
  const itemsJson = JSON.stringify(order.items);
  db.run(
    "INSERT INTO orders (timestamp, total, status, items_json, updated_at, sync_version) VALUES (?, ?, ?, ?, ?, 1)",
    [ts, order.total, order.status || "completed", itemsJson, t]
  );
  const res = db.exec("SELECT last_insert_rowid()");
  const id = res[0].values[0][0];
  await enqueueSync("orders", id, "create", { id, timestamp: ts, total: order.total, status: order.status, items: order.items });
  await persistToDisk();
  return id;
}

export async function deleteOrder(id: number): Promise<void> {
  // Soft-delete locally (so the sync engine can push the deletion to Supabase),
  // then hard-delete after sync completes. This preserves the original "permanent
  // delete" UX while ensuring the deletion propagates to the online DB.
  const t = now();
  // Mark as deleted locally (soft delete) + enqueue sync so Supabase learns about it
  db.run(
    "UPDATE orders SET deleted_at = ?, updated_at = ?, sync_version = sync_version + 1 WHERE id = ?",
    [t, t, id]
  );
  await enqueueSync("orders", id, "delete", { id });
  await persistToDisk();
}

export async function updateOrderStatus(id: number, status: string): Promise<void> {
  const t = now();
  const numId = Number(id);
  db.run(
    "UPDATE orders SET status = ?, updated_at = ?, sync_version = sync_version + 1 WHERE id = ?",
    [status, t, numId]
  );
  // For status changes we still push an update so the server reflects it.
  const ordRes = db.exec("SELECT id, timestamp, total, status, items_json FROM orders WHERE id = ?", [numId]);
  if (ordRes.length) {
    const r = ordRes[0].values[0];
    let items: OrderItem[] = [];
    try {
      items = JSON.parse(r[4]);
    } catch {}
    await enqueueSync("orders", numId, "update", {
      id: r[0],
      timestamp: r[1],
      total: r[2],
      status: r[3],
      items,
      updated_at: t,
    });
  } else {
    // Order not in local DB (e.g. pulled from server with different id sequence).
    // Enqueue a synthetic update so the server still learns about the status change.
    await enqueueSync("orders", numId, "update", {
      id: numId,
      status,
      updated_at: t,
    });
  }
  await persistToDisk();
}

export async function clearAllOrders(): Promise<void> {
  db.run("DELETE FROM orders");
  db.run("DELETE FROM sqlite_sequence WHERE name='orders'");
  db.run("DELETE FROM sync_queue WHERE entity_type = 'orders'");
  await persistToDisk();
}

export async function updateStoreInfo(info: Record<string, string>): Promise<void> {
  const t = now();
  for (const [k, v] of Object.entries(info)) {
    const jsonValue = JSON.stringify(v);
    // Check if the row exists
    const existing = db.exec("SELECT sync_version FROM store_info WHERE key = ?", [k]);
    if (existing.length > 0) {
      // Update existing row
      db.run(
        "UPDATE store_info SET value = ?, updated_at = ?, sync_version = sync_version + 1, deleted_at = NULL WHERE key = ?",
        [jsonValue, t, k]
      );
    } else {
      // Insert new row
      db.run(
        "INSERT INTO store_info (key, value, updated_at, sync_version, deleted_at) VALUES (?, ?, ?, 1, NULL)",
        [k, jsonValue, t]
      );
    }
    // Send the JSON-encoded value + updated_at so the server can upsert correctly
    await enqueueSync("store_info", k, "update", { key: k, value: jsonValue, updated_at: t });
  }
  await persistToDisk();
}

// ---------- Stats / analytics (mirror original SQL with 9-hour shift) ----------

export function getStats(filters: StatsFilters = {}): Stats {
  if (!db) return { revenue: 0, orders: 0, returnedValue: 0, returnedCount: 0 };
  let where = "WHERE deleted_at IS NULL";
  const params: any[] = [];
  if (filters.status) {
    where += " AND status = ?";
    params.push(filters.status);
  }
  if (filters.month) {
    where += " AND strftime('%Y-%m', datetime((timestamp - ?) / 1000, 'unixepoch', 'localtime')) = ?";
    params.push(BUSINESS_SHIFT_MS, filters.month);
  }
  if (filters.date) {
    where += " AND strftime('%Y-%m-%d', datetime((timestamp - ?) / 1000, 'unixepoch', 'localtime')) = ?";
    params.push(BUSINESS_SHIFT_MS, filters.date);
  }
  try {
    const res = db.exec(`SELECT SUM(total), COUNT(*) FROM orders ${where}`, params);
    const revenue = res.length ? Number(res[0].values[0][0]) || 0 : 0;
    const orders = res.length ? Number(res[0].values[0][1]) || 0 : 0;

    let retWhere = "WHERE status = 'returned' AND deleted_at IS NULL";
    const retParams: any[] = [];
    if (filters.month) {
      retWhere += " AND strftime('%Y-%m', datetime((timestamp - ?) / 1000, 'unixepoch', 'localtime')) = ?";
      retParams.push(BUSINESS_SHIFT_MS, filters.month);
    }
    if (filters.date) {
      retWhere += " AND strftime('%Y-%m-%d', datetime((timestamp - ?) / 1000, 'unixepoch', 'localtime')) = ?";
      retParams.push(BUSINESS_SHIFT_MS, filters.date);
    }
    const retRes = db.exec(`SELECT COUNT(*), SUM(total) FROM orders ${retWhere}`, retParams);
    const returnedCount = retRes.length ? Number(retRes[0].values[0][0]) || 0 : 0;
    const returnedValue = retRes.length ? Number(retRes[0].values[0][1]) || 0 : 0;
    return { revenue, orders, returnedValue, returnedCount };
  } catch (e) {
    console.error("Stats failed:", e);
    return { revenue: 0, orders: 0, returnedValue: 0, returnedCount: 0 };
  }
}

export function getSummaryByDate(filters: DateSummaryFilters = {}): DateSummaryPoint[] {
  if (!db) return [];
  const scope = filters.scope || "month";
  const format = scope === "month" ? "%Y-%m-%d" : "%Y-%m";
  let where = "WHERE status = 'completed' AND deleted_at IS NULL";
  const whereParams: any[] = [];
  if (filters.month && scope === "month") {
    where += " AND strftime('%Y-%m', datetime((timestamp - ?) / 1000, 'unixepoch', 'localtime')) = ?";
    whereParams.push(BUSINESS_SHIFT_MS, filters.month);
  } else if (filters.year) {
    where += " AND strftime('%Y', datetime((timestamp - ?) / 1000, 'unixepoch', 'localtime')) = ?";
    whereParams.push(BUSINESS_SHIFT_MS, filters.year);
  }
  try {
    const sql = `
      SELECT strftime('${format}', datetime((timestamp - ?) / 1000, 'unixepoch', 'localtime')) as label,
             SUM(total) as revenue, COUNT(*) as orders
      FROM orders ${where}
      GROUP BY label ORDER BY label ASC
    `;
    const res = db.exec(sql, [BUSINESS_SHIFT_MS, ...whereParams]);
    if (!res.length) return [];
    return res[0].values.map((r: any[]) => ({
      label: r[0],
      revenue: Number(r[1]) || 0,
      orders: Number(r[2]) || 0,
    }));
  } catch (e) {
    console.error("Summary by date failed:", e);
    return [];
  }
}

export function getSummaryByCategory(
  filters: CategorySummaryFilters = {},
  products: Product[],
  categories: Category[]
): CategorySummary {
  if (!db) return { categories: [], products: [] };
  let where = "WHERE status = 'completed' AND deleted_at IS NULL";
  const params: any[] = [BUSINESS_SHIFT_MS];
  if (filters.month) {
    where += " AND strftime('%Y-%m', datetime((timestamp - ?) / 1000, 'unixepoch', 'localtime')) = ?";
    params.push(filters.month);
  }
  try {
    const res = db.exec(`SELECT items_json FROM orders ${where}`, params);
    const categoryMap: Record<string, number> = {};
    const productMap: Record<string, number> = {};
    const prodToCatName: Record<string, string> = {};
    products.forEach((p) => {
      const cat = categories.find((c) => c.id === p.categoryId);
      if (cat) prodToCatName[p.name] = cat.name;
    });
    if (res.length) {
      for (const row of res[0].values) {
        let items: OrderItem[] = [];
        try {
          items = JSON.parse(row[0]);
        } catch {}
        for (const item of items) {
          const prod = item.name || "Unknown";
          const cat = (item as any).category || prodToCatName[prod] || "Uncategorized";
          const val = Number(item.total) || 0;
          categoryMap[cat] = (categoryMap[cat] || 0) + val;
          productMap[prod] = (productMap[prod] || 0) + val;
        }
      }
    }
    const cats = Object.entries(categoryMap)
      .map(([name, value]) => ({ name, value }))
      .filter((c) => c.value > 0 && c.name !== "Uncategorized")
      .sort((a, b) => b.value - a.value);
    const prods = Object.entries(productMap)
      .map(([name, value]) => ({ name, value }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    return { categories: cats, products: prods };
  } catch (e) {
    console.error("Summary by category failed:", e);
    return { categories: [], products: [] };
  }
}

// ---------- Sync queue ----------

async function enqueueSync(
  entityType: SyncEntityType,
  entityId: string | number,
  operation: "create" | "update" | "delete",
  payload: unknown
): Promise<void> {
  db.run(
    "INSERT INTO sync_queue (entity_type, entity_id, operation, payload, created_at, attempts) VALUES (?, ?, ?, ?, ?, 0)",
    [entityType, String(entityId), operation, JSON.stringify(payload), Date.now()]
  );
}

export function getSyncQueue(): SyncQueueItem[] {
  if (!db) return [];
  const res = db.exec(
    "SELECT id, entity_type, entity_id, operation, payload, created_at, attempts, last_error FROM sync_queue ORDER BY created_at ASC"
  );
  if (!res.length) return [];
  return res[0].values.map((r: any[]) => ({
    id: r[0],
    entity_type: r[1],
    entity_id: r[2],
    operation: r[3],
    payload: r[4],
    created_at: r[5],
    attempts: r[6],
    last_error: r[7],
  }));
}

export function getPendingSyncCount(): number {
  if (!db) return 0;
  const res = db.exec("SELECT COUNT(*) FROM sync_queue");
  return res.length ? Number(res[0].values[0][0]) || 0 : 0;
}

export async function clearSyncQueueItem(id: number): Promise<void> {
  db.run("DELETE FROM sync_queue WHERE id = ?", [id]);
  await persistToDisk();
}

export async function clearSyncQueue(): Promise<void> {
  db.run("DELETE FROM sync_queue");
  await persistToDisk();
}

export async function markSyncQueueError(id: number, error: string): Promise<void> {
  db.run("UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?", [error, id]);
  await persistToDisk();
}

// Apply server-pulled records into the local DB (during sync pull).
export async function applyPulledRecord(
  entityType: SyncEntityType,
  record: any
): Promise<void> {
  const t = record.updated_at || Date.now();
  if (entityType === "store_info") {
    db.run(
      "INSERT OR REPLACE INTO store_info (key, value, updated_at, sync_version) VALUES (?, ?, ?, ?)",
      [record.key, record.value, t, record.sync_version || 1]
    );
  } else if (entityType === "categories") {
    db.run(
      `INSERT OR REPLACE INTO categories (id, name, color, emoji, position, updated_at, deleted_at, sync_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.name, record.color, record.emoji, record.position || 0, t, record.deleted_at || null, record.sync_version || 1]
    );
  } else if (entityType === "products") {
    db.run(
      `INSERT OR REPLACE INTO products (id, name, category_id, price, quantity_type, is_custom, updated_at, deleted_at, sync_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.name, record.category_id, record.price, record.quantity_type, record.is_custom ? 1 : 0, t, record.deleted_at || null, record.sync_version || 1]
    );
  } else if (entityType === "orders") {
    const itemsJson = typeof record.items_json === "string" ? record.items_json : JSON.stringify(record.items || []);
    db.run(
      `INSERT OR REPLACE INTO orders (id, timestamp, total, status, items_json, updated_at, deleted_at, sync_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.timestamp, record.total, record.status, itemsJson, t, record.deleted_at || null, record.sync_version || 1]
    );
  }
  await persistToDisk();
}
