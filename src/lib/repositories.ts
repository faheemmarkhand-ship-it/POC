// src/lib/repositories.ts
// Repository abstraction layer — the UI talks to this, never directly to SQLite or fetch().
// Routes reads/writes between offline SQLite WASM and the online FastAPI backend based on connectivity.
//
// Conceptually (from the migration spec):
//   UI → Repository → { Offline: SQLite WASM | Online: FastAPI → PostgreSQL }
//
// All business mutations ALWAYS write to the local SQLite first (offline-first), then enqueue sync.
// When online, reads can be served from the server (freshness), but local is authoritative for UX.

import {
  initOfflineDb,
  loadAllData,
  addCategory as dbAddCategory,
  updateCategory as dbUpdateCategory,
  deleteCategory as dbDeleteCategory,
  updateCategoryOrder as dbUpdateCategoryOrder,
  addProduct as dbAddProduct,
  updateProduct as dbUpdateProduct,
  deleteProduct as dbDeleteProduct,
  saveOrder as dbSaveOrder,
  deleteOrder as dbDeleteOrder,
  updateOrderStatus as dbUpdateOrderStatus,
  clearAllOrders as dbClearAllOrders,
  updateStoreInfo as dbUpdateStoreInfo,
  getStats as dbGetStats,
  getSummaryByDate as dbGetSummaryByDate,
  getSummaryByCategory as dbGetSummaryByCategory,
  getPendingSyncCount,
} from "@/lib/db/offline-db";
import { api } from "@/lib/api-client";
import { getSyncState, setSyncState, runSync } from "@/lib/sync/sync-engine";
import type {
  Category,
  Product,
  Order,
  OrderItem,
  StoreInfo,
  Stats,
  StatsFilters,
  DateSummaryPoint,
  DateSummaryFilters,
  CategorySummary,
  CategorySummaryFilters,
  CategoryInput,
  ProductInput,
  OrderInput,
} from "@/types/pos";

let ready = false;

export async function ensureReady(): Promise<void> {
  if (ready) return;
  await initOfflineDb();
  ready = true;
}

// Force a fresh reload of in-memory data (mirrors original loadData).
export async function loadData(): Promise<{
  store: StoreInfo;
  categories: Category[];
  products: Product[];
  orders: Order[];
}> {
  await ensureReady();
  return loadAllData();
}

// ---------- Categories ----------

export async function listCategories(): Promise<Category[]> {
  await ensureReady();
  return loadAllData().categories;
}

export async function createCategory(input: CategoryInput): Promise<Category> {
  await ensureReady();
  const id = await dbAddCategory(input);
  maybeSync();
  return { id, position: 0, ...input };
}

export async function updateCategory(cat: Category): Promise<void> {
  await ensureReady();
  await dbUpdateCategory(cat);
  maybeSync();
}

export async function deleteCategory(id: number): Promise<void> {
  await ensureReady();
  await dbDeleteCategory(id);
  maybeSync();
}

export async function reorderCategories(idOrderMap: Record<string, number>): Promise<void> {
  await ensureReady();
  await dbUpdateCategoryOrder(idOrderMap);
  maybeSync();
}

// ---------- Products ----------

export async function listProducts(): Promise<Product[]> {
  await ensureReady();
  return loadAllData().products;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  await ensureReady();
  const id = await dbAddProduct(input);
  maybeSync();
  return {
    id,
    name: input.name,
    categoryId: typeof input.categoryId === "string" ? parseInt(input.categoryId) : input.categoryId,
    price: input.price,
    quantityType: input.quantityType,
    isCustom: input.isCustom,
  };
}

export async function updateProduct(product: Product): Promise<void> {
  await ensureReady();
  await dbUpdateProduct(product);
  maybeSync();
}

export async function deleteProduct(id: number): Promise<void> {
  await ensureReady();
  await dbDeleteProduct(id);
  maybeSync();
}

// ---------- Orders ----------

export async function listOrders(): Promise<Order[]> {
  await ensureReady();
  return loadAllData().orders;
}

export async function createOrder(input: OrderInput): Promise<number> {
  await ensureReady();
  const id = await dbSaveOrder(input);
  maybeSync();
  return id;
}

export async function deleteOrder(id: number): Promise<void> {
  await ensureReady();
  await dbDeleteOrder(id);
  maybeSync();
}

export async function updateOrderStatus(id: number, status: string): Promise<void> {
  await ensureReady();
  await dbUpdateOrderStatus(id, status);
  maybeSync();
}

export async function clearAllOrders(): Promise<void> {
  await ensureReady();
  await dbClearAllOrders();
  maybeSync();
}

// ---------- Store info ----------

export async function updateStoreInfo(info: Partial<StoreInfo>): Promise<void> {
  await ensureReady();
  await dbUpdateStoreInfo(info as Record<string, string>);
  maybeSync();
}

// ---------- Stats / analytics ----------

export async function getStats(filters: StatsFilters): Promise<Stats> {
  await ensureReady();
  return dbGetStats(filters);
}

export async function getSummaryByDate(filters: DateSummaryFilters): Promise<DateSummaryPoint[]> {
  await ensureReady();
  return dbGetSummaryByDate(filters);
}

export async function getSummaryByCategory(
  filters: CategorySummaryFilters,
  products: Product[],
  categories: Category[]
): Promise<CategorySummary> {
  await ensureReady();
  return dbGetSummaryByCategory(filters, products, categories);
}

// ---------- Connectivity / sync status ----------

export async function getConnectivity(): Promise<{
  online: boolean;
  pending: number;
}> {
  return { online: getSyncState().online, pending: getPendingSyncCount() };
}

function maybeSync() {
  const s = getSyncState();
  if (s.online && s.status !== "syncing") {
    runSync().catch((e) => console.error("Background sync failed:", e));
  }
}

// Manually trigger a sync (used by UI).
export async function syncNow(): Promise<void> {
  await runSync();
}

// Pull fresh data from server into local DB (used after reconnect / manual refresh).
export async function pullFromServer(): Promise<void> {
  await runSync();
}
