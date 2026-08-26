// src/stores/pos-store.ts
// Zustand store for client-side app state: active tab, cart, loaded data, sync status, toasts.
// Business logic for cart/checkout mirrors the original POSSystem class.

import { create } from "zustand";
import type {
  Category,
  Product,
  Order,
  OrderItem,
  StoreInfo,
  SyncStatus,
} from "@/types/pos";

export type TabName = "pos" | "sales" | "menu" | "settings";

interface PosState {
  // App data
  store: StoreInfo;
  categories: Category[];
  products: Product[];
  orders: Order[];
  dataLoaded: boolean;

  // UI state
  activeTab: TabName;
  cart: OrderItem[];
  cartSidebarOpen: boolean;
  dbSetupOpen: boolean;

  // Sales filters
  activeMonth: string;
  activeSalesStatus: "completed" | "returned" | "deleted";

  // Sync status
  syncStatus: SyncStatus;
  syncOnline: boolean;
  syncPending: number;
  syncConflicts: number;
  lastSyncedAt: number | null;

  // Pending order (for receipt/checkout flow)
  pendingOrder: (Order & { dbId?: number }) | null;
  receiptModalOpen: boolean;

  // Actions
  setStore: (s: StoreInfo) => void;
  setCategories: (c: Category[]) => void;
  setProducts: (p: Product[]) => void;
  setOrders: (o: Order[]) => void;
  setData: (d: { store: StoreInfo; categories: Category[]; products: Product[]; orders: Order[] }) => void;
  setDataLoaded: (v: boolean) => void;

  setActiveTab: (t: TabName) => void;
  setActiveMonth: (m: string) => void;
  setActiveSalesStatus: (s: "completed" | "returned" | "deleted") => void;

  addToCart: (product: Product | OrderItem) => void;
  removeFromCart: (index: number) => void;
  updateCartItemQuantity: (index: number, delta: number) => void;
  clearCart: () => void;
  setCartSidebarOpen: (v: boolean) => void;

  setDbSetupOpen: (v: boolean) => void;
  setSyncStatus: (s: SyncStatus, online?: boolean, pending?: number, conflicts?: number, lastSyncedAt?: number | null) => void;
  setPendingOrder: (o: (Order & { dbId?: number }) | null) => void;
  setReceiptModalOpen: (v: boolean) => void;
}

function getCurrentMonth(): string {
  const now = new Date();
  const business = new Date(now.getTime() - 9 * 60 * 60 * 1000);
  return `${business.getFullYear()}-${String(business.getMonth() + 1).padStart(2, "0")}`;
}

export const usePosStore = create<PosState>((set) => ({
  store: { name: "Naseeb Biryani", address: "Local POS System" },
  categories: [],
  products: [],
  orders: [],
  dataLoaded: false,

  activeTab: "pos",
  cart: [],
  cartSidebarOpen: false,
  dbSetupOpen: true,

  activeMonth: getCurrentMonth(),
  activeSalesStatus: "completed",

  syncStatus: "offline",
  syncOnline: false,
  syncPending: 0,
  syncConflicts: 0,
  lastSyncedAt: null,

  pendingOrder: null,
  receiptModalOpen: false,

  setStore: (s) => set({ store: s }),
  setCategories: (c) => set({ categories: c }),
  setProducts: (p) => set({ products: p }),
  setOrders: (o) => set({ orders: o }),
  setData: (d) =>
    set({
      store: d.store,
      categories: d.categories,
      products: d.products,
      orders: d.orders,
    }),
  setDataLoaded: (v) => set({ dataLoaded: v }),

  setActiveTab: (t) => set({ activeTab: t }),
  setActiveMonth: (m) => set({ activeMonth: m }),
  setActiveSalesStatus: (s) => set({ activeSalesStatus: s }),

  addToCart: (product) =>
    set((st) => {
      const id = (product as OrderItem).id ?? (product as Product).id;
      const price = Number((product as OrderItem).price ?? 0);
      const cart = [...st.cart];
      const existing = cart.find((item) => item.id === id);
      if (existing) {
        existing.quantity += 1;
        existing.total = existing.quantity * existing.price;
      } else {
        cart.push({
          id,
          name: (product as OrderItem).name,
          categoryId: (product as OrderItem).categoryId ?? null,
          price,
          quantityType: (product as OrderItem).quantityType,
          isCustom: (product as OrderItem).isCustom,
          quantity: 1,
          total: price,
        });
      }
      return { cart, cartSidebarOpen: true };
    }),

  removeFromCart: (index) =>
    set((st) => {
      const cart = [...st.cart];
      cart.splice(index, 1);
      return { cart };
    }),

  updateCartItemQuantity: (index, delta) =>
    set((st) => {
      const cart = [...st.cart];
      const item = cart[index];
      if (!item) return {};
      item.quantity += delta;
      if (item.quantity <= 0) {
        cart.splice(index, 1);
      } else {
        item.total = item.quantity * item.price;
      }
      return { cart };
    }),

  clearCart: () => set({ cart: [] }),
  setCartSidebarOpen: (v) => set({ cartSidebarOpen: v }),
  setDbSetupOpen: (v) => set({ dbSetupOpen: v }),

  setSyncStatus: (s, online, pending, conflicts, lastSyncedAt) =>
    set((st) => ({
      syncStatus: s,
      syncOnline: online !== undefined ? online : st.syncOnline,
      syncPending: pending !== undefined ? pending : st.syncPending,
      syncConflicts: conflicts !== undefined ? conflicts : st.syncConflicts,
      lastSyncedAt: lastSyncedAt !== undefined ? lastSyncedAt : st.lastSyncedAt,
    })),

  setPendingOrder: (o) => set({ pendingOrder: o }),
  setReceiptModalOpen: (v) => set({ receiptModalOpen: v }),
}));
