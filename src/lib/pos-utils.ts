// src/lib/pos-utils.ts
// Business-logic helpers — ported faithfully from the original POS JavaScript.
// These MUST match the original behavior (qty weights, order ID format, cart display names).

import type { CartItem, Order, Product, Category } from "@/types/pos";

// Format order ID as ORD-XXX (zero-padded to 3 digits) — matches original formatOrderId.
export function formatOrderId(id: number | string): string {
  if (typeof id === "string" && id.startsWith("ORD-")) return id;
  const n = Number(id);
  return `ORD-${String(n).padStart(3, "0")}`;
}

// Quantity weight for smart sorting — matches original getQtyWeight.
export function getQtyWeight(q?: string): number {
  if (!q) return 0;
  const text = q.toLowerCase();
  if (text.includes("1 pao")) return 250;
  if (text.includes("dedh pao")) return 375;
  if (text.includes("adha kilo") || text.includes("half kg")) return 500;
  if (text.includes("3 pao")) return 750;
  if (text.includes("1 kg")) return 1000;
  if (text.includes("2 kg")) return 2000;
  if (text.includes("single") || text.includes("1 plate")) return 10;
  if (text.includes("double") || text.includes("2 plate")) return 20;
  return 100;
}

// Clean a product name for sorting (strip quantities/units) — matches original cleanName.
export function cleanNameForSort(name: string): string {
  return name
    .split("(")[0]
    .replace(/\d+\s*kg|\d+\s*pao|adha kilo|dedh pao/i, "")
    .trim()
    .toLowerCase();
}

// Sort products: category → cleaned name → qty weight — matches original sort.
export function sortProducts(products: Product[]): Product[] {
  return [...products].sort((a, b) => {
    if ((a.categoryId ?? 0) !== (b.categoryId ?? 0)) {
      return (a.categoryId ?? 0) - (b.categoryId ?? 0);
    }
    const nameA = cleanNameForSort(a.name);
    const nameB = cleanNameForSort(b.name);
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return getQtyWeight(a.quantityType) - getQtyWeight(b.quantityType);
  });
}

// Quantity display labels — matches original quantityLabels map.
const QUANTITY_LABELS: Record<string, string> = {
  "1_pao": "1 Pao",
  dedh_pao: "Dedh Pao",
  half_kg: "half kg",
  adha_double: "Adha Kilo Double",
  "3_pao": "3 Pao",
  "1_kg": "1kg",
};

// Build cart display name: "ProductName - Unit" for non-pcs/none quantities.
export function cartDisplayName(item: CartItem): string {
  let displayName = item.name;
  const qType = (item.quantityType || "").toLowerCase();
  if (qType && !["pcs", "none", "pieces"].includes(qType) && !displayName.toLowerCase().includes(qType)) {
    const unit = QUANTITY_LABELS[item.quantityType || ""] || item.quantityType || "";
    if (unit) displayName = `${displayName} - ${unit}`;
  }
  return displayName;
}

// Receipt item display name — matches original renderReceiptHTML item name logic.
export function receiptItemDisplayName(item: CartItem, products: Product[]): string {
  let displayName = item.name;
  const prodId = (item as any).productId || item.id;
  if (prodId && !String(prodId).startsWith("custom_")) {
    const product = products.find((p) => String(p.id) === String(prodId));
    if (product && product.quantityType && !["pcs", "none"].includes(product.quantityType)) {
      const unit = QUANTITY_LABELS[product.quantityType] || product.quantityType;
      if (unit && !displayName.toLowerCase().includes(unit.toLowerCase())) {
        displayName = `${displayName} - ${unit}`;
      }
    }
  }
  return displayName;
}

// Compute the next numeric order id — matches original checkout logic.
export function nextOrderId(orders: Order[]): number {
  if (!orders.length) return 1;
  const maxId = orders.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0);
  return maxId + 1;
}

// Cart grand total.
export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.total, 0);
}

// Build the business-day string for today (9-hour shift) — matches original renderSalesData.
export function currentBusinessMonth(): string {
  const now = new Date();
  const business = new Date(now.getTime() - 9 * 60 * 60 * 1000);
  return `${business.getFullYear()}-${String(business.getMonth() + 1).padStart(2, "0")}`;
}

export function currentBusinessDate(): string {
  const now = new Date();
  const business = new Date(now.getTime() - 9 * 60 * 60 * 1000);
  return business.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

// Shift a timestamp by the 9-hour business shift and return YYYY-MM or YYYY-MM-DD.
export function businessMonthOf(timestamp: number): string {
  const d = new Date(timestamp - 9 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function businessDateOf(timestamp: number): string {
  const d = new Date(timestamp - 9 * 60 * 60 * 1000);
  return d.toLocaleDateString("en-CA");
}

// Map category-color backgrounds for product cards — matches original inline styles.
export function productCardStyle(category?: Category): React.CSSProperties {
  if (!category || !category.color) return {};
  return {
    borderColor: category.color,
    background: `linear-gradient(135deg, ${category.color}20 0%, ${category.color}05 100%)`,
  };
}

export function formatCurrency(n: number): string {
  return `Rs. ${Number(n || 0).toLocaleString()}`;
}

// Build a quick lookup of product name → category name for analytics fallback.
export function productToCategoryName(products: Product[], categories: Category[]): Record<string, string> {
  const map: Record<string, string> = {};
  products.forEach((p) => {
    const cat = categories.find((c) => c.id === p.categoryId);
    if (cat) map[p.name] = cat.name;
  });
  return map;
}
