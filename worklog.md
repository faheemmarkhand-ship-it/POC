# Naseeb Biryani POS — Migration Worklog

Source: `POS-main V1.rar` (HTML/CSS/JS + SQLite WASM, offline-first restaurant POS).
Target: Next.js 16 frontend + FastAPI backend + SQLite WASM offline + online DB + sync engine.

## Original Application — Audit Summary (Phase 1-4)

**App:** "Naseeb Biryani and Pakwan Center — POS System"
**Stack:** Pure HTML/CSS/JS, sql.js (SQLite WASM) in-browser, File System Access API persistence, optional Google Drive backup, single-page app with 4 tabs (POS, Sales, Menu, Settings).

### Database Schema (SQLite — preserved as source of truth)
- `store_info(key TEXT PK, value TEXT)` — key/value store config
- `categories(id INTEGER PK AUTOINCREMENT, name TEXT, color TEXT, emoji TEXT, position INTEGER DEFAULT 0)`
- `products(id INTEGER PK AUTOINCREMENT, name TEXT, category_id INTEGER, price REAL, quantity_type TEXT, is_custom INTEGER)`
- `orders(id INTEGER PK AUTOINCREMENT, timestamp INTEGER, total REAL, status TEXT, items_json TEXT)`

### Existing Data (from `database/pos_data.db`)
- store_info: 6 keys (name, address, phone, email, receiptHeader, receiptFooter)
- categories: 7 (Chicken Tikka Biryani, Beef Yakhni Pulao, Beef Biryani, Saadi Biryani, Raita and Salad, ...)
- products: 38
- orders: 4725

### Key Business Logic (must preserve)
- **9-hour business-day shift**: late-night orders grouped with previous business day (timestamp - 9h before date grouping). Used in stats, sales filters, analytics.
- **Order statuses**: `completed`, `returned`, `deleted`. "Delete" = soft delete (move to deleted tab). Returned = separate tab.
- **Order ID format**: `ORD-XXX` zero-padded to 3 digits.
- **Product quantity types** (radio set): pcs, 1_pao(250g), dedh_pao(375g), half_kg/"1 Boti Adha Kilo"(500g), adha_double(1kg), 3_pao(750g), 1_kg, custom.
- **Smart product sort**: by category → cleaned name → qty weight (1 pao=250, dedh pao=375, adha kilo/half kg=500, 3 pao=750, 1 kg=1000, 2 kg=2000, single/1 plate=10, double/2 plate=20).
- **Cart display**: "ProductName - Unit" appended for non-pcs/none quantities.
- **Receipt**: dual print (Customer Copy + Counter Copy), Invoice No ORD-XXX, header/logo/store info, items table (PRODUCT/QTY/UNIT PRICE/SUBT), totals (Subtotal, Total, Cash Received), footer.
- **Category drag-and-drop reordering** persisted to `position` column.
- **Stats** computed in SQL directly for accuracy: revenue, orders, returnedCount, returnedValue. Summary by date (monthly daily / yearly monthly) and by category + top-10 products (parsed from items_json).
- **Analytics**: line chart (revenue trend), doughnut (sales by category), horizontal bar (top products).
- **Connectivity monitoring**: navigator.onLine + HEAD fetch to google favicon every 15s.
- **Custom item entry**: category + price → cart item with id `custom_<timestamp>`.
- **Validation**: product requires name + price>0; category deletion blocked if it has products.

### Migration Architecture (sandbox-adapted)
- **Frontend**: Next.js 16 (port 3000, `/` route only). Single-page 4-tab app preserving original UI/CSS. sql.js SQLite WASM offline DB seeded with original data, persisted to IndexedDB/OPFS. Repository abstraction + sync engine. Zustand for cart/UI state.
- **Backend**: FastAPI Python mini-service (port 8001, via `?XTransformPort=8001`). SQLAlchemy models (PostgreSQL-compatible types: BIGINT, etc.), Pydantic schemas, REST APIs, sync endpoints with updated_at-based conflict resolution. Uses SQLite storage with documented one-line switch to PostgreSQL via `DATABASE_URL`.
- **Sync**: offline writes go to local SQLite + `sync_queue`; online drains queue to FastAPI; last-write-wins with updated_at comparison + conflict exposure.
- **Connectivity indicator**: Online/Offline/Syncing/Synced/Sync Error badges matching original style.

---
Task ID: 0
Agent: main (orchestrator)
Task: Audit original POS app, create migration plan & worklog.

Work Log:
- Extracted RAR (66 app files, excluding .venv/.git).
- Read index.html, package.json, seed_db.js, data-service.js, google-drive-service.js, ui-renderer.js (1084 lines), app.js (1153 lines), all page templates (pos/sales/menu/settings/modals/receipt), variables.css.
- Dumped actual SQLite DB: schema + 6/7/38/4725 rows. Exported to upload/seed_data.json.

Stage Summary:
- Complete understanding of schema, business logic, UI, and data captured.
- Migration architecture defined (Next.js + FastAPI mini-service + SQLite WASM + sync).
- Foundation ready to build.

---
Task ID: 3
Agent: general-purpose (FastAPI backend)
Task: Build FastAPI backend mini-service on port 8001

Work Log:
- Read worklog.md (audit summary + migration architecture) and inspected `/home/z/my-project/upload/seed_data.json` structure (store_info values JSON-encoded, includes Urdu UTF-8 text; 6/7/38/4725 rows; order columns: id, timestamp, total, status, items_json; status distribution: completed=4611, returned=65, deleted=49).
- Created venv at `mini-services/pos-api/.venv` (Python 3.12) and installed `fastapi`, `uvicorn[standard]`, `sqlalchemy>=2.0`, `pydantic>=2` via `uv pip install`.
- Built clean service/repository layout under `mini-services/pos-api/app/`:
  - `config.py` (POS_API_DATABASE_URL env override, SEED_DATA_PATH, CORS allow all)
  - `db.py` (engine, SessionLocal, Base; SQLite WAL + foreign_keys pragmas)
  - `models.py` (4 tables: store_info, categories, products, orders; PostgreSQL-compatible types BigInteger/Integer/Float/Text; PK_TYPE = `BigInteger().with_variant(Integer(), "sqlite")` so autoincrement works on both SQLite and PostgreSQL; sync columns updated_at/deleted_at/sync_version on every mutable table)
  - `schemas.py` (Pydantic v2 input/output models)
  - `utils.py` (`now_ms()`)
  - `repositories/{store_info,categories,products,orders,stats,sync}.py` (each with list/create/update/soft_delete + `upsert_for_sync` for sync engine)
  - `services/seed.py` (idempotent: imports all 4 tables from seed_data.json, preserves original ids, updates `sqlite_sequence` so new orders continue past id 4725)
  - `services/stats.py` (9-hour business-day shift applied to all month/date filters and date/month grouping via SQLite `strftime` on `datetime((timestamp - 9h)/1000, 'unixepoch')`)
  - `api/routes.py` (all routers under `/api` prefix)
  - `main.py` (FastAPI app, CORS allow all origins/methods/headers, startup creates tables + runs seed)
- Wrote `requirements.txt`, `pyproject.toml`, `index.py` entry, `README.md` (API table + run instructions + caveats), `DATABASE.md` (schema, sync columns, conflict rule, PostgreSQL switch note, 9-hour shift explanation).
- Hit env-var conflict: a global `DATABASE_URL=file:/home/z/my-project/db/custom.db` is set in the sandbox (for the Next.js frontend). Renamed our setting to `POS_API_DATABASE_URL` to avoid clobbering it.
- Hit SQLite autoincrement bug on first POST /api/orders (NOT NULL constraint failed: orders.id): `BigInteger` PRIMARY KEY on SQLite is NOT a rowid alias and does not autoincrement on NULL. Fixed by using `BigInteger().with_variant(Integer(), "sqlite")` for all primary keys (emits `INTEGER PRIMARY KEY` on SQLite, `BIGINT PRIMARY KEY` on PostgreSQL). Recreated DB, re-seeded (4725 orders imported in ~1s).
- Background-process challenge: the bash tool kills the process group on command exit. Solved with a double-fork Python daemon (`/tmp/daemon_pos.py`) that fully detaches into its own session before `os.execv`-ing uvicorn. Server survives across bash commands. PID file at `mini-services/pos-api/server.pid` (reloader pid 3811, worker pid 3813).
- Verified every endpoint with real data:
  - GET /api/health → `{status:ok, db:connected, counts:{store_info:6, categories:7, products:38, orders:4725}}`
  - GET /api/store-info → 6 keys with Urdu text rendered correctly (UTF-8 preserved)
  - GET /api/categories → 7 categories sorted by position
  - GET /api/products → 38 products
  - GET /api/orders?limit=3 → latest 3 orders, items_json parsed into arrays, sorted timestamp DESC
  - GET /api/stats → revenue=1929547, orders=4725, returnedCount=65, returnedValue=29500 (all-time)
  - GET /api/stats?month=2026-01 → revenue=1318927, orders=2980, returnedCount=31, returnedValue=13550
  - GET /api/stats?month=2026-02 → revenue=610620, orders=1745, returnedCount=34, returnedValue=15950
  - GET /api/summary/date?month=2026-02&scope=month → 4 daily labels (2026-02-01..04)
  - GET /api/summary/date?year=2026&scope=year → 2 monthly labels (2026-01, 2026-02)
  - GET /api/summary/category?month=2026-02 → 7 categories + top-10 products
  - POST /api/orders → creates order id 4726, returns full row with parsed items
  - PUT /api/orders/{id}/status → status updated to 'returned'
  - DELETE /api/orders/{id} → hard deleted, count back to 4725
  - POST /api/categories + PUT + DELETE → all work; DELETE on category with non-deleted products returns 409 with exact message "Cannot delete category: It still contains products"
  - PUT /api/categories/order → reorders by idOrderMap
  - POST/PUT/DELETE /api/products → all work (soft delete)
  - POST /api/sync/push → applies new records (verified with id=999 test category), returns `{applied, conflicts, server_time}`
  - POST /api/sync/push with stale updated_at + mismatched sync_version → returns conflict in conflicts[] list, server record NOT overwritten (verified category 10 stayed "Chicken Tikka Biryani")
  - GET /api/sync/pull?since=0 → returns all 4776 records (7/38/4725/6) including soft-deleted for delete sync
  - GET /api/sync/pull?since=<future> → returns 0 records (filter works)
- Cleaned up all test data; final DB state matches seed (6/7/38/4725).

Stage Summary:
- **Service running**: uvicorn on `0.0.0.0:8001` with `--reload`, PID file `mini-services/pos-api/server.pid` (reloader pid 3811, worker pid 3813). Logs append to `mini-services/pos-api/server.log`.
- **Start command** (from scratch):
  ```bash
  cd /home/z/my-project/mini-services/pos-api
  uv venv .venv --python 3.12
  source .venv/bin/activate
  uv pip install fastapi "uvicorn[standard]" sqlalchemy pydantic
  # Background start (double-fork daemon so it survives shell exit):
  python3 /tmp/daemon_pos.py   # script content documented in this worklog
  # Foreground (debug):
  .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload --app-dir /home/z/my-project/mini-services/pos-api
  ```
  The daemon script (`/tmp/daemon_pos.py`) double-forks then `os.execv`s uvicorn with `--reload`; stdout/stderr are appended to `server.log`; PID written to `server.pid`.
- **API list** (all under `/api`, CORS allow all):
  - `GET /api/health` → status + DB counts
  - `GET|PUT /api/store-info`
  - `GET|POST /api/categories`, `PUT|DELETE /api/categories/{id}` (409 if has products), `PUT /api/categories/order`
  - `GET|POST /api/products`, `PUT|DELETE /api/products/{id}` (soft delete)
  - `GET|POST /api/orders` (filters: status/month/date/limit/search; ORD-XXX search; 9-hour shift on month/date; default sort timestamp DESC; default limit 5000), `PUT /api/orders/{id}/status`, `DELETE /api/orders/{id}` (hard delete), `DELETE /api/orders` (clear all + reset autoincrement)
  - `GET /api/stats?status=&month=&date=` (9-hour shift applied)
  - `GET /api/summary/date?month=&scope=month|year&year=` (9-hour shift; scope=month → daily labels; scope=year → monthly labels)
  - `GET /api/summary/category?month=` (parse items_json, group by category, top-10 products)
  - `POST /api/sync/push` `{changes, device_id}` → `{applied, conflicts, server_time}` (conflict rule: server `updated_at` strictly newer OR `sync_version` differs → conflict, NOT overwritten)
  - `GET /api/sync/pull?since=<epoch_ms>` → all records with `updated_at > since` (includes soft-deleted so clients can sync deletes)
- **Database**: SQLite at `mini-services/pos-api/pos_server.db` (WAL mode). All column types PostgreSQL-compatible; one-line switch to PostgreSQL via `POS_API_DATABASE_URL=postgresql+psycopg://...` (no model edits). Sync columns `updated_at`, `deleted_at`, `sync_version` added to all 4 tables. Autoincrement handled via `BigInteger().with_variant(Integer(), "sqlite")` for primary keys (works on both backends).
- **Seed**: 6 store_info (incl. Urdu text), 7 categories, 38 products, 4725 orders imported on first startup; idempotent (skips existing rows). `sqlite_sequence` updated so new orders continue past id 4725.
- **Caveats**:
  - The sandbox has a global `DATABASE_URL` env var (set for the Next.js frontend); we use `POS_API_DATABASE_URL` instead to avoid clobbering it.
  - Background process detachment required a double-fork daemon (simple `nohup ... &` was killed by the bash tool's process-group cleanup). The daemon script lives at `/tmp/daemon_pos.py`; restart with `python3 /tmp/daemon_pos.py` after killing the PID in `server.pid`.
  - 9-hour business-day shift is implemented via SQLite `strftime` on `datetime((timestamp - 9*3600*1000)/1000, 'unixepoch')`; for PostgreSQL the equivalent would need `to_char(to_timestamp(...))` — wrapped in a TODO comment in `app/repositories/orders.py` and `stats.py` for the eventual switchover.
  - `DELETE /api/orders/{id}` is a hard delete (matches original `deleteOrder`); `DELETE /api/orders` (no id) clears all + resets autoincrement (matches original `clearAllOrders`).
  - Order search matches `ORD-XXX` format (zero-padded 3 digits) case-insensitively; implemented in Python for cross-DB portability (avoids SQLite-only `printf`/`||` operators in the WHERE clause).
  - Frontend can call this backend via Caddy gateway with `?XTransformPort=8001` query param (per `/home/z/my-project/Caddyfile`).


---
Task ID: 2,4,5,6,7,8
Agent: main (orchestrator) — Next.js frontend
Task: Build the complete Next.js frontend (data layer + 4 tabs + modals + sync) preserving the original POS UI/UX.

Work Log:
- Copied original resources (LOGO.jpg, R-LOGO.png, NB.ico) to public/.
- Concatenated all 17 original CSS files into src/app/pos.css (+ sticky-footer/print/scrollbar additions).
- Installed sql.js; copied sql-wasm.wasm + sql-wasm-browser.wasm to public/.
- Exported compact frontend seed (public/seed-data.json: 6 store_info, 7 categories, 38 products, 300 recent orders).
- Built TypeScript types (src/types/pos.ts) mirroring schema + business constants (QUANTITY_OPTIONS, EMOJI_OPTIONS, BUSINESS_SHIFT_MS).
- Built offline SQLite WASM layer (src/lib/db/offline-db.ts): initSchema with sync columns, seedFromBundle, loadAllData, full CRUD, getStats/getSummaryByDate/getSummaryByCategory with 9h shift, sync_queue, applyPulledRecord.
- Built api-client.ts (relative URLs + ?XTransformPort=8001 gateway pattern).
- Built repository abstraction (src/lib/repositories.ts): UI-facing API routing offline↔online.
- Built sync engine (src/lib/sync/sync-engine.ts): connectivity monitor (15s), runSync (push+pull), last-write-wins conflict handling, subscribeSync for UI.
- Built Zustand store (src/stores/pos-store.ts): cart, tabs, data, sync status, modals.
- Built business-logic utils (src/lib/pos-utils.ts): formatOrderId, getQtyWeight, sortProducts, cartDisplayName, nextOrderId, business date helpers.
- Built shell components: Header, NavTabs, ConnectivityIndicator, Toast, DbSetupModal, ConfirmModal.
- Built modals: ProductModal (qty radios + pcs/weight fields), CategoryModal, ReceiptModal (dual customer/counter copy + Urdu), PriceAdjustModal.
- Built 4 tabs: PosTab (pills, products grid, drag-drop, custom entry, cart, checkout), SalesTab (list+visual, filters, 5 summary cards, sub-tabs, charts via recharts, export), MenuTab (grouped cards + orphaned), SettingsTab (store info, receipt, category CRUD, sync now).
- Updated layout.tsx (Inter font, NB favicon, Font Awesome CDN, pos.css import) and page.tsx (single-page shell).

Verification (Agent Browser end-to-end):
- Startup modal renders → click "Let's Go" → SQLite WASM inits + seeds → POS tab loads 7 categories, 38 products, smart sorting correct.
- Click product → cart sidebar opens with "Chicken Tikka Biryani - 1 Pao", checkout shows "Process Payment TOTAL:Rs. 160".
- Receipt modal: ORD-4726, store header with Urdu text, items table, totals — faithful to original.
- Sales tab Feb 2026: 296 rows, Revenue Rs. 104,690 (local) → Rs. 539,050 (after server sync). ORD-4725 first row.
- Analytics: 3 charts render (line trend, category doughnut, top products bar).
- Menu tab: grouped product cards + orphaned section.
- Settings: store info pre-filled, 7 categories listed, Sync Now works.
- Connectivity: "Offline" on direct port 3000 → "Syncing..."→"Online" through gateway (port 81) with ?XTransformPort=8001.
- Backend verified via gateway: /api/health, /api/stats (revenue 1,929,547), /api/orders all return real data.

Stage Summary:
- Full offline-first Next.js POS app faithful to original UI/UX + business logic.
- Offline SQLite WASM (IndexedDB-persisted) + FastAPI backend (port 8001) + sync engine working end-to-end.
- All 4 tabs + modals + receipt + charts functional and browser-verified.
- Documentation: README, ARCHITECTURE, DATABASE, SYNC, MIGRATION written.

---
Task ID: 9
Agent: main (orchestrator) — Mobile UI/UX overhaul
Task: Fix mobile-friendly issues — header overlap, nav spacing, POS layout, Sales page, cart UX.

Work Log:
- Analyzed 3 user-uploaded screenshots with VLM — identified: header logo overlap, nav bar spacing issues, broken 2-column POS layout on mobile, 5 KPI cards overflowing horizontally, filters side-by-side overflow, oversized Process Payment button.
- Fixed Header.tsx: inline logo badge (NB) instead of floating overlapping div; compact layout.
- Updated NavTabs.tsx: tabs now flex equally with icon+label, even distribution.
- Appended comprehensive mobile-first CSS to pos.css (~310 lines):
  - Header: compact 56px height, inline logo badge, smaller fonts
  - Nav: sticky, icon+label, even flex distribution
  - Sync banner: compact single-line on mobile
  - POS: single-column layout, cart as bottom sheet (slide-up, 75vh max), floating cart button when closed
  - Product grid: 2-column on mobile (was 1-column/overflowing)
  - Category pills: horizontal scroll (no wrap overflow)
  - Manual entry form: stacked vertically
  - Sales: KPI cards in 2-column grid, filters stacked vertically, full-width sub-tabs
  - Menu: 2-column grid on mobile
  - Settings: single column
  - Modals: full-screen on mobile
  - Toast: full-width bottom on mobile
  - Small phones (<380px): 1-column grids
- Added floating cart button to PosTab.tsx (shows item count + total, opens cart sheet).

Verification (Agent Browser at 390x844 mobile viewport):
- POS: header 56px, 38 products in 2-column grid (147px each), no overlap.
- Floating cart button works: shows "1 Rs. 160" after adding product, opens cart sheet.
- Sales (Feb 2026): KPI cards in 2-column grid (175px each), controls stacked vertically (flex-direction: column).
- Menu: 38 cards in 2-column grid (174px each).
- Settings: single column (369px full width).
- Desktop (1280x800): no regression — 38 products in 7-column grid, all features intact.
- VLM confirmed: "KPI cards in 2 columns, filters stacked, mobile-friendly layout".

Stage Summary:
- All mobile UI/UX issues fixed: no more overlapping header, no horizontal overflow, compact touch-friendly layout.
- Cart is now a slide-up bottom sheet on mobile with a floating button to reopen it.
- Sales page KPIs and filters stack properly.
- Desktop layout unchanged (no regressions).

---
Task ID: 10
Agent: main (orchestrator) — Logo restore + scale reduction + Supabase config
Task: Restore the real logo, reduce overall app scale for small desktops, add Supabase connection config, remove modal description text.

Work Log:
- Restored real LOGO.jpg image in Header.tsx (replaced the "NB" text badge with the actual <img> tag pointing to /LOGO.jpg, 1024x1024 natural size).
- Updated DbSetupModal.tsx: removed the descriptive paragraph ("Offline-first POS system. Runs locally with SQLite WebAssembly...") and the footer paragraph. Modal now shows only: logo + title + "Let's Go" button.
- Added global scale reduction CSS to pos.css (3 breakpoints):
  - max-width 1440px: html font 15px, header 64px, nav 48px
  - max-width 1280px: html font 14px, header 56px, nav 44px, cart-width 440px, smaller product cards
  - max-width 1100px: html font 13px, cart-width 380px, 130px product cards
  - Large desktops (>1440px): unchanged (16px font, 80px header) — no regression
- Added Supabase support:
  - Updated mini-services/pos-api/app/config.py: comprehensive docstring showing exactly how to use Supabase (connection string format, step-by-step)
  - Created mini-services/pos-api/.env.example with Supabase example + instructions
  - Added psycopg2-binary to requirements.txt (required for PostgreSQL connections)
  - Added "Online Database (Supabase)" section to SettingsTab.tsx with a code-block showing the .env format and step-by-step instructions

Verification:
- Startup modal: shows only logo + title + "Let's Go" (description text removed).
- Header logo: /LOGO.jpg loads correctly (1024x1024 natural, displayed 150x38).
- Scale at 1280x720: html font 14px, header 56px, nav 44px — compact and efficient.
- Scale at 1920x1080: html font 16px, header 80px — no regression on large screens.
- Settings: Supabase section visible with env hint (POS_API_DATABASE_URL) and steps (supabase.com).
- VLM confirmed: "Logo visible, compact scale, efficient layout".

Stage Summary:
- Real logo restored in header.
- App scales down smoothly on small desktops (3 breakpoints).
- Supabase connection is one env var: POS_API_DATABASE_URL in mini-services/pos-api/.env
- Startup modal cleaned up (no description text).

---
Task ID: 11
Agent: main (orchestrator) — Header redesign + remove Supabase section
Task: Fix logo placement/spacing as a professional UI/UX designer would; remove Supabase details from Settings (user will add manually).

Work Log:
- Analyzed the user's screenshot with VLM as a professional UI/UX designer review:
  - Issue: logo showed as a grey placeholder box (the original .logo CSS had width:150px, height:150px, background:#9CA3AF, margin-top:15px — designed for the old "floating logo" layout, now broken inline).
  - Issue: vertical misalignment between logo box and title text (text floated higher than logo center).
  - Issue: unbalanced spacing — heavy visual weight on left, empty space on right.
- Redesigned the header with !important overrides appended to pos.css:
  - .logo: height = header-height - 22px (clean 38px badge in 56px header), max-width 52px, border-radius, white background padding, subtle shadow, object-fit: cover, no border/margin-top.
  - .store-info: flex:1, vertically centered, h1 with proper font-size/line-height, nowrap + ellipsis.
  - .header-content: max-width 1600px centered, gap: spacing-4, balanced flex layout.
  - .header-window-controls: flex-shrink:0, right-aligned, compact 36px buttons with translucent white background.
  - Responsive: logo shrinks further at 1280px (44px) and 768px (38px).
- Removed the "Online Database (Supabase)" section from SettingsTab.tsx (user will add the connection manually).

Verification:
- Logo now displays as the actual restaurant logo (white square with red graphical elements), not a grey box.
- Logo is 38x38px, vertically centered in the 56px header.
- Title "Naseeb Biryani and Pakwan Center" sits cleanly next to the logo with balanced spacing.
- Close button (X) is right-aligned with a translucent white background.
- Supabase section removed from Settings (confirmed: "Supabase section removed ✓").
- VLM confirmed: "Logo displaying correctly, header functional and visually acceptable".

Stage Summary:
- Header redesigned professionally: real logo, balanced layout, clean spacing, vertically aligned.
- Supabase details removed from Settings UI (config.py + .env.example retain the instructions for manual setup).
