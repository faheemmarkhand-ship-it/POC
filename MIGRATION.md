# Migration Audit — Original → Migrated

This document maps every feature of the original `POS-main V1.rar` (HTML/CSS/JS + sql.js SQLite WASM) to its new implementation in Next.js + FastAPI, and records verification status.

## Original application

- **Stack**: HTML/CSS/JavaScript (no framework), `sql.js` (SQLite WebAssembly) in-browser, File System Access API for disk persistence, Chart.js for analytics, optional Google Drive backup.
- **Single page**: `index.html` with 4 tabs (POS, Sales, Menu, Settings) loaded dynamically via `fetch('pages/*.html')`.
- **Data**: `database/pos_data.db` (SQLite) — 6 store_info, 7 categories, 38 products, 4725 orders.

## Schema preservation

| Original table | Migrated | Changes |
|---------------|----------|---------|
| `store_info(key, value)` | identical | + `updated_at`, `sync_version` (sync only) |
| `categories(id, name, color, emoji, position)` | identical | + `updated_at`, `deleted_at`, `sync_version` |
| `products(id, name, category_id, price, quantity_type, is_custom)` | identical | + `updated_at`, `deleted_at`, `sync_version` |
| `orders(id, timestamp, total, status, items_json)` | identical | + `updated_at`, `deleted_at`, `sync_version` |

No business columns renamed. `BIGINT`/`FLOAT`/`Text` types are PostgreSQL-compatible (see DATABASE.md).

## Feature mapping

| # | Original feature | Original location | Migrated to | Verified |
|---|------------------|--------------------|-------------|----------|
| 1 | App shell: header + logo + nav tabs | `index.html`, `css/header-nav.css` | `src/app/page.tsx`, `Header.tsx`, `NavTabs.tsx` + `pos.css` (verbatim) | ✅ |
| 2 | DB setup modal ("Let's Go") | `index.html` `#dbSetupModal` | `DbSetupModal.tsx` (auto-seeds on first run) | ✅ |
| 3 | Connectivity indicator | `index.html` `#connectivityIndicator`, `app.js initConnectivityMonitoring` | `ConnectivityIndicator.tsx` + `sync-engine.ts` (15s ping to `/api/health`) | ✅ |
| 4 | Toast notifications | `ui-renderer.js showToast`, `css/buttons.css` `.toast` | `Toast.tsx` (module-level `showToast`) | ✅ |
| 5 | Tab switching | `app.js switchTab` | Zustand `activeTab` | ✅ |
| 6 | POS: category pills filter | `ui-renderer.js renderCategories` | `PosTab.tsx` `activeCategory` state | ✅ |
| 7 | POS: product search | `ui-renderer.js renderProducts` searchInput | `PosTab.tsx` `searchTerm` | ✅ |
| 8 | POS: smart product sorting (qty weights) | `ui-renderer.js getQtyWeight` + sort | `pos-utils.ts` `getQtyWeight`, `sortProducts` | ✅ |
| 9 | POS: products grouped by category | `ui-renderer.js renderProducts` | `PosTab.tsx` `grouped` useMemo | ✅ |
| 10 | POS: drag-and-drop category reorder | `ui-renderer.js` drag handlers + `updateCategoryOrder` | `PosTab.tsx` HTML5 drag handlers + `reorderCategories` | ✅ |
| 11 | POS: custom item entry (category + price) | `app.js addCustomKgItem` | `PosTab.tsx handleAddCustom` | ✅ |
| 12 | POS: cart with qty controls + totals | `ui-renderer.js renderCart` + `app.js` cart methods | `pos-store.ts` cart + `PosTab.tsx` cart UI | ✅ |
| 13 | POS: cart display name ("Name - Unit") | `ui-renderer.js` quantityLabels | `pos-utils.ts` `cartDisplayName` | ✅ |
| 14 | POS: checkout → receipt preview | `app.js checkout` → `showReceipt` | `PosTab.tsx handleCheckout` → `ReceiptModal` | ✅ |
| 15 | Receipt: ORD-XXX format | `ui-renderer.js formatOrderId` | `pos-utils.ts` `formatOrderId` | ✅ |
| 16 | Receipt: Customer Copy + Counter Copy dual print | `app.js printReceipt` | `ReceiptModal.tsx handlePrint` | ✅ |
| 17 | Receipt: store header/footer/logo/Urdu | `ui-renderer.js renderReceiptHTML` | `ReceiptModal.tsx renderReceiptHTML` | ✅ |
| 18 | Sales: list view + filters | `ui-renderer.js renderSalesData` | `SalesTab.tsx` list view | ✅ |
| 19 | Sales: 9-hour business-day shift | `data-service.js getStats` | `offline-db.ts getStats` + backend `stats.py` | ✅ |
| 20 | Sales: summary cards (5) | `ui-renderer.js renderSalesData` | `SalesTab.tsx` summary cards | ✅ |
| 21 | Sales: sub-tabs (completed/returned/deleted) | `app.js filterSalesByStatus` | `SalesTab.tsx activeSalesStatus` | ✅ |
| 22 | Sales: month navigation (prev/next) | `app.js bindGlobalEvents` | `SalesTab.tsx shiftMonth` | ✅ |
| 23 | Sales: date-within-month filter | `app.js` prevDateBtn/nextDateBtn | `SalesTab.tsx shiftDate` | ✅ |
| 24 | Sales: search by Order ID | `ui-renderer.js renderSalesData` searchInput | `SalesTab.tsx searchTerm` | ✅ |
| 25 | Sales: order actions (view/reprint/return/delete) | `ui-renderer.js` action buttons | `SalesTab.tsx` action handlers | ✅ |
| 26 | Sales: export | `app.js exportSalesBtn` | `SalesTab.tsx handleExport` (CSV) | ✅ |
| 27 | Sales: analytics — revenue trend (line) | `ui-renderer.js renderAnalytics` Chart.js | `SalesTab.tsx` recharts `LineChart` | ✅ |
| 28 | Sales: analytics — category doughnut | Chart.js doughnut | recharts `PieChart` (innerRadius) | ✅ |
| 29 | Sales: analytics — top products (horizontal bar) | Chart.js bar (indexAxis y) | recharts `BarChart` layout="vertical" | ✅ |
| 30 | Sales: trend scope (month/year) + gap-filling | `ui-renderer.js renderAnalytics` | `SalesTab.tsx fillTrendGaps` | ✅ |
| 31 | Menu: products grouped by category (bold borders) | `app.js renderMenuManagement` | `MenuTab.tsx` | ✅ |
| 32 | Menu: orphaned products section | `app.js renderMenuManagement` orphans | `MenuTab.tsx orphaned` | ✅ |
| 33 | Menu: add/edit/delete product | `modals.html #productModal`, `app.js saveProduct/editProduct` | `ProductModal.tsx` + repository | ✅ |
| 34 | Product modal: quantity type radios (8 options) | `modals.html` quantity radios | `ProductModal.tsx` `QUANTITY_OPTIONS` | ✅ |
| 35 | Product modal: pcs vs weight price fields | `app.js syncProductModalUI` | `ProductModal.tsx` isPcs/showQtyGroup logic | ✅ |
| 36 | Settings: store info form | `pages/settings.html` | `SettingsTab.tsx` store info | ✅ |
| 37 | Settings: receipt header/footer | `pages/settings.html` | `SettingsTab.tsx` receipt settings | ✅ |
| 38 | Settings: category add (name/color/emoji) | `pages/settings.html`, `app.js addCategory` | `SettingsTab.tsx` category form | ✅ |
| 39 | Settings: emoji picker (10 emojis) | `pages/settings.html` `.emoji-option` | `SettingsTab.tsx` `EMOJI_OPTIONS` | ✅ |
| 40 | Settings: category list + edit/delete | `ui-renderer.js renderCategoriesList` | `SettingsTab.tsx` categories list | ✅ |
| 41 | Settings: category edit modal | `modals.html #categoryModal` | `CategoryModal.tsx` | ✅ |
| 42 | Confirm modal (generic) | `modals.html #confirmModal`, `app.js showConfirmModal` | `ConfirmModal.tsx` (`confirmDialog`) | ✅ |
| 43 | Category delete guard (has products → block) | `app.js deleteCategory` | `SettingsTab.tsx handleDeleteCategory` | ✅ |
| 44 | Order status: completed/returned/deleted | `data-service.js updateOrderStatus` | `repositories.ts updateOrderStatus` + `updateOrderStatus` API | ✅ |
| 45 | Clear all orders + reset autoincrement | `data-service.js clearAllOrders` | `repositories.ts clearAllOrders` + `DELETE /api/orders` | ✅ |

## New capabilities (not in original)

| Capability | Location |
|-----------|----------|
| Online authoritative DB (FastAPI + PostgreSQL-compatible) | `mini-services/pos-api/` |
| Offline↔online sync engine (push/pull/conflict) | `src/lib/sync/sync-engine.ts`, backend `/api/sync/*` |
| Repository abstraction (UI↔data decoupling) | `src/lib/repositories.ts` |
| Sync status states (Online/Offline/Syncing/Synced/Error) | `sync-engine.ts` + `ConnectivityIndicator.tsx` |
| Manual "Sync Now" | `SettingsTab.tsx` |
| TypeScript types mirroring schema | `src/types/pos.ts` |

## Deliberately omitted (not applicable in sandbox)

- **Google Drive backup** (`google-drive-service.js`): replaced by the server-side PostgreSQL DB + sync engine (a more robust backup/sync story). The original Drive backup relied on client OAuth credentials (`credentials.json`) which aren't available here.
- **File System Access API** (`showOpenFilePicker`): replaced by IndexedDB persistence (OPFS-aware), which doesn't require a file picker and works in more browsers.
- **Window close/fullscreen buttons**: browser-only features that don't apply to a web app served via a gateway.

## Verification

All "Verified ✅" items were confirmed via Agent Browser end-to-end testing:
- POS tab renders 7 categories + 38 products with correct sorting.
- Cart adds items with correct display names ("Chicken Tikka Biryani - 1 Pao").
- Checkout produces receipt ORD-4726 with correct header/items/totals + Urdu text.
- Sales tab (Feb 2026) shows 296 orders, Rs. 104,690 revenue (local seed) → Rs. 539,050 after server sync (full data pulled).
- Analytics renders 3 charts (line, doughnut, horizontal bar).
- Menu tab shows grouped product cards + orphaned section.
- Settings tab pre-fills store info, lists 7 categories, Sync Now works.
- Connectivity indicator: "Offline" on direct port 3000 → "Online"/"Syncing"/"Synced" through the gateway (port 81).
