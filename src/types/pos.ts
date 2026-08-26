// src/types/pos.ts
// Shared TypeScript types — mirror the original SQLite POS schema + app data shapes.
// Keep consistent with the FastAPI Pydantic schemas and the online PostgreSQL-compatible DB.

export interface StoreInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  [key: string]: string | undefined;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  emoji: string;
  position?: number;
}

export type QuantityType =
  | "pcs"
  | "1_pao"
  | "dedh_pao"
  | "half_kg"
  | "adha_double"
  | "3_pao"
  | "1_kg"
  | "custom"
  | string;

export interface Product {
  id: number;
  name: string;
  categoryId: number | null;
  price: number;
  quantityType: string;
  isCustom: boolean;
}

export type OrderStatus = "completed" | "returned" | "deleted";

export interface CartItem {
  id: number | string;
  name: string;
  categoryId: number | null;
  price: number;
  quantityType?: string;
  isCustom?: boolean;
  quantity: number;
  total: number;
}

export type OrderItem = CartItem;

export interface Order {
  id: number;
  timestamp: number;
  total: number;
  status: OrderStatus;
  items: OrderItem[];
  paymentMethod?: string;
}

export interface Stats {
  revenue: number;
  orders: number;
  returnedValue: number;
  returnedCount: number;
}

export interface DateSummaryPoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface CategorySummary {
  categories: { name: string; value: number }[];
  products: { name: string; value: number }[];
}

export interface CategoryInput {
  name: string;
  color: string;
  emoji: string;
}

export interface ProductInput {
  name: string;
  categoryId: number | string;
  price: number;
  quantityType: string;
  isCustom: boolean;
}

export interface OrderInput {
  timestamp?: number;
  total: number;
  status: OrderStatus;
  items: OrderItem[];
}

export interface StatsFilters {
  status?: OrderStatus;
  month?: string;
  date?: string;
}

export interface DateSummaryFilters {
  month?: string;
  scope?: "month" | "year";
  year?: string;
}

export interface CategorySummaryFilters {
  month?: string;
}

export interface POSSystemData {
  store: StoreInfo;
  categories: Category[];
  products: Product[];
  orders: Order[];
  settings: Record<string, unknown>;
}

export type SyncStatus = "online" | "offline" | "syncing" | "synced" | "sync-error";

export type SyncEntityType = "categories" | "products" | "orders" | "store_info";

export interface SyncQueueItem {
  id?: number;
  entity_type: SyncEntityType;
  entity_id: string | number;
  operation: "create" | "update" | "delete";
  payload: string;
  created_at: number;
  attempts: number;
  last_error?: string;
}

export interface SyncPushResult {
  applied: Record<SyncEntityType, number>;
  conflicts: Array<{
    entity_type: SyncEntityType;
    entity_id: string | number;
    server_record: unknown;
    client_record: unknown;
    reason: string;
  }>;
  server_time: number;
}

export interface SyncPullResult {
  categories: unknown[];
  products: unknown[];
  orders: unknown[];
  store_info: unknown[];
  server_time: number;
}

export interface QuantityOption {
  value: QuantityType;
  display: string;
  label: string;
}

export const QUANTITY_OPTIONS: QuantityOption[] = [
  { value: "pcs", display: "Pieces", label: "🔹 Pieces (pcs)" },
  { value: "1_pao", display: "1 Pao", label: "🔹 1 Pao (250g)" },
  { value: "dedh_pao", display: "Dedh Pao", label: "🔹 Dedh Pao (375g)" },
  { value: "half_kg", display: "1 Boti Adha Kilo", label: "🔹 1 Boti Adha Kilo (500g)" },
  { value: "adha_double", display: "Adha Kilo Double", label: "🔹 Adha Kilo Double (1kg)" },
  { value: "3_pao", display: "3 Pao", label: "🔹 3 Pao (750g)" },
  { value: "1_kg", display: "1 Kg", label: "🔹 1 Kg" },
  { value: "custom", display: "CUSTOM", label: "✏️ Custom Quantity" },
];

export const EMOJI_OPTIONS = [
  "🍛", "🥘", "🥣", "🍖", "🍗", "🍲", "🥗", "🍽️", "🧂", "🥤",
];

export const BUSINESS_SHIFT_MS = 9 * 60 * 60 * 1000;
