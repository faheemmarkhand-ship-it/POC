-- ===================================================================
--  Naseeb Biryani POS — Supabase Schema Migration
-- ===================================================================
--  HOW TO RUN:
--    1. Open your Supabase project dashboard
--       https://supabase.com/dashboard/project/tiybeuglcubkndufyisp
--    2. Click "SQL Editor" in the left sidebar
--    3. Click "New query"
--    4. Paste this entire file
--    5. Click "Run" (▶)
--  After running, the tables below will exist and the POS backend
--  will be able to read/write data via the Supabase REST API.
-- ===================================================================

-- Drop existing tables if re-running (careful — this deletes all data!)
-- Uncomment the lines below if you want a clean reset:
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS products CASCADE;
-- DROP TABLE IF EXISTS categories CASCADE;
-- DROP TABLE IF EXISTS store_info CASCADE;

-- ---------- store_info (key/value config) ----------
CREATE TABLE IF NOT EXISTS store_info (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at BIGINT NOT NULL DEFAULT 0,
    deleted_at BIGINT,
    sync_version BIGINT NOT NULL DEFAULT 0
);

-- ---------- categories ----------
CREATE TABLE IF NOT EXISTS categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    color TEXT,
    emoji TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    deleted_at BIGINT,
    sync_version BIGINT NOT NULL DEFAULT 0
);

-- ---------- products ----------
CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT,
    category_id BIGINT,
    price DOUBLE PRECISION,
    quantity_type TEXT,
    is_custom INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    deleted_at BIGINT,
    sync_version BIGINT NOT NULL DEFAULT 0
);

-- ---------- orders ----------
CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    timestamp BIGINT,
    total DOUBLE PRECISION,
    status TEXT,
    items_json TEXT,
    updated_at BIGINT NOT NULL DEFAULT 0,
    deleted_at BIGINT,
    sync_version BIGINT NOT NULL DEFAULT 0
);

-- ---------- Indexes for common queries ----------
CREATE INDEX IF NOT EXISTS idx_categories_deleted ON categories(deleted_at);
CREATE INDEX IF NOT EXISTS idx_categories_position ON categories(position);
CREATE INDEX IF NOT EXISTS idx_products_deleted ON products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_deleted ON orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_timestamp ON orders(timestamp);
CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at);
CREATE INDEX IF NOT EXISTS idx_store_info_updated_at ON store_info(updated_at);

-- ---------- Enable Row Level Security + permissive policies ----------
-- The POS backend uses the anon/publishable key, so we allow full access
-- from the API. For production with real users, tighten these policies.
ALTER TABLE store_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Permissive policies (anon key can do everything — fine for a POS backend)
CREATE POLICY "anon_all_store_info" ON store_info FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_orders" ON orders FOR ALL USING (true) WITH CHECK (true);

-- ===================================================================
--  SEED DATA (original Naseeb Biryani POS data)
-- ===================================================================

-- Store info (values are JSON-encoded strings, like the original app)
INSERT INTO store_info (key, value, updated_at, sync_version) VALUES
  ('name', '"Naseeb Biryani and Pakwan Center"', extract(epoch from now()) * 1000, 1),
  ('address', '"Model Colony, Karachi, Pakistan"', extract(epoch from now()) * 1000, 1),
  ('phone', '"03161084780"', extract(epoch from now()) * 1000, 1),
  ('email', '"شادی اور تقریبات کے لیے آپ کا بھروسہ"', extract(epoch from now()) * 1000, 1),
  ('receiptHeader', '"آپ کی تقریب، ہمارا کمال"', extract(epoch from now()) * 1000, 1),
  ('receiptFooter', '"Thank you for your visit!"', extract(epoch from now()) * 1000, 1)
ON CONFLICT (key) DO NOTHING;

-- Categories
INSERT INTO categories (id, name, color, emoji, position, updated_at, sync_version) VALUES
  (10, 'Chicken Tikka Biryani', '#0078c2', '🍗', 0, extract(epoch from now()) * 1000, 1),
  (15, 'Beef Yakhni Pulao', '#000000', '🥘', 1, extract(epoch from now()) * 1000, 1),
  (16, 'Beef Biryani', '#4dff61', '🍖', 2, extract(epoch from now()) * 1000, 1),
  (18, 'Saadi Biryani', '#d4ff00', '🍲', 3, extract(epoch from now()) * 1000, 1),
  (19, 'Raita and Salad', '#ff00ea', '🥗', 4, extract(epoch from now()) * 1000, 1),
  (20, 'Drink', '#3B82F6', '🥤', 5, extract(epoch from now()) * 1000, 1),
  (21, 'Sada pulao', '#CD853F', '🥣', 6, extract(epoch from now()) * 1000, 1)
ON CONFLICT (id) DO NOTHING;

-- Products (36 items)
INSERT INTO products (id, name, category_id, price, quantity_type, is_custom, updated_at, sync_version) VALUES
  (1, 'Chicken Tikka Biryani', 10, 160, '1 Pao', 0, extract(epoch from now()) * 1000, 1),
  (2, 'Chicken Tikka Biryani', 10, 220, 'Dedh Pao', 0, extract(epoch from now()) * 1000, 1),
  (3, 'Chicken Tikka Biryani', 10, 270, '1 Boti Adha Kilo', 0, extract(epoch from now()) * 1000, 1),
  (4, 'Chicken Tikka Biryani', 10, 320, 'Adha Kilo Double', 0, extract(epoch from now()) * 1000, 1),
  (5, 'Chicken Tikka Biryani', 10, 480, '3 Pao', 0, extract(epoch from now()) * 1000, 1),
  (6, 'Chicken Tikka Biryani', 10, 640, '1 Kg', 0, extract(epoch from now()) * 1000, 1),
  (7, 'Beef Yakhni Pulao', 15, 180, '1 Pao', 0, extract(epoch from now()) * 1000, 1),
  (8, 'Beef Yakhni Pulao', 15, 270, 'Dedh Pao', 0, extract(epoch from now()) * 1000, 1),
  (9, 'Beef Yakhni Pulao', 15, 360, 'Adha Kilo Double', 0, extract(epoch from now()) * 1000, 1),
  (10, 'Beef Yakhni Pulao', 15, 540, '3 Pao', 0, extract(epoch from now()) * 1000, 1),
  (11, 'Beef Yakhni Pulao', 15, 720, '1 Kg', 0, extract(epoch from now()) * 1000, 1),
  (12, 'Beef Biryani', 16, 180, '1 Pao', 0, extract(epoch from now()) * 1000, 1),
  (13, 'Beef Biryani', 16, 270, 'Dedh Pao', 0, extract(epoch from now()) * 1000, 1),
  (14, 'Beef Biryani', 16, 360, 'Adha Kilo Double', 0, extract(epoch from now()) * 1000, 1),
  (15, 'Beef Biryani', 16, 540, '3 Pao', 0, extract(epoch from now()) * 1000, 1),
  (16, 'Beef Biryani', 16, 720, '1 Kg', 0, extract(epoch from now()) * 1000, 1),
  (17, 'Chana Pulao', 16, 160, '1 Pao', 0, extract(epoch from now()) * 1000, 1),
  (18, 'Chana Pulao', 16, 240, 'Dedh Pao', 0, extract(epoch from now()) * 1000, 1),
  (19, 'Saadi Biryani', 18, 130, '1 Pao', 0, extract(epoch from now()) * 1000, 1),
  (20, 'Saadi Biryani', 18, 200, 'Dedh Pao', 0, extract(epoch from now()) * 1000, 1),
  (21, 'Saadi Biryani', 18, 270, 'Adha Kilo Double', 0, extract(epoch from now()) * 1000, 1),
  (22, 'Raita', 19, 40, 'Small', 0, extract(epoch from now()) * 1000, 1),
  (23, 'Fresh Salad', 19, 40, 'Plate', 0, extract(epoch from now()) * 1000, 1),
  (24, 'Shami Kabab', 19, 60, '1 Piece', 0, extract(epoch from now()) * 1000, 1),
  (25, 'Pepsi', 20, 60, '250ml', 0, extract(epoch from now()) * 1000, 1),
  (26, 'Pepsi', 20, 90, '500ml', 0, extract(epoch from now()) * 1000, 1),
  (27, 'Pepsi', 20, 130, '1L', 0, extract(epoch from now()) * 1000, 1),
  (28, 'Pepsi', 20, 180, '1.5L', 0, extract(epoch from now()) * 1000, 1),
  (29, 'Mineral Water', 20, 50, 'Small', 0, extract(epoch from now()) * 1000, 1),
  (30, 'Mineral Water', 20, 100, 'Large', 0, extract(epoch from now()) * 1000, 1),
  (31, '7 Up', 20, 60, '250ml', 0, extract(epoch from now()) * 1000, 1),
  (32, '7 Up', 20, 90, '500ml', 0, extract(epoch from now()) * 1000, 1),
  (33, 'Mirinda', 20, 60, '250ml', 0, extract(epoch from now()) * 1000, 1),
  (34, 'Mirinda', 20, 90, '500ml', 0, extract(epoch from now()) * 1000, 1),
  (35, 'Sada Pulao', 21, 130, '1 Pao', 0, extract(epoch from now()) * 1000, 1),
  (36, 'Sada Pulao', 21, 200, 'Dedh Pao', 0, extract(epoch from now()) * 1000, 1)
ON CONFLICT (id) DO NOTHING;

-- Reset sequences so new inserts get the next available id
SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));
SELECT setval('products_id_seq', (SELECT MAX(id) FROM products));

-- Done! Verify with:
-- SELECT 'store_info' AS t, COUNT(*) FROM store_info
-- UNION ALL SELECT 'categories', COUNT(*) FROM categories
-- UNION ALL SELECT 'products', COUNT(*) FROM products
-- UNION ALL SELECT 'orders', COUNT(*) FROM orders;
