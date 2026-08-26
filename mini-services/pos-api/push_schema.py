"""Push the POS schema + seed data directly to Supabase via PostgreSQL."""
import sys
import time
import json
import psycopg2
from psycopg2.extras import RealDictCursor

DB_HOST = "aws-0-ap-southeast-1.pooler.supabase.com"
DB_PORT = 6543
DB_NAME = "postgres"
DB_USER = "postgres.tiybeuglcubkndufyisp"
DB_PASSWORD = "D2TxtsrRt4qW21zA"

SCHEMA_SQL = """
-- Drop existing (careful)
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS store_info CASCADE;

-- store_info
CREATE TABLE store_info (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at BIGINT NOT NULL DEFAULT 0,
    deleted_at BIGINT,
    sync_version BIGINT NOT NULL DEFAULT 0
);

-- categories
CREATE TABLE categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT, color TEXT, emoji TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    deleted_at BIGINT,
    sync_version BIGINT NOT NULL DEFAULT 0
);

-- products
CREATE TABLE products (
    id BIGSERIAL PRIMARY KEY,
    name TEXT, category_id BIGINT, price DOUBLE PRECISION,
    quantity_type TEXT, is_custom INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL DEFAULT 0,
    deleted_at BIGINT,
    sync_version BIGINT NOT NULL DEFAULT 0
);

-- orders
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    timestamp BIGINT, total DOUBLE PRECISION, status TEXT, items_json TEXT,
    updated_at BIGINT NOT NULL DEFAULT 0,
    deleted_at BIGINT,
    sync_version BIGINT NOT NULL DEFAULT 0
);

-- Indexes
CREATE INDEX idx_categories_deleted ON categories(deleted_at);
CREATE INDEX idx_categories_position ON categories(position);
CREATE INDEX idx_products_deleted ON products(deleted_at);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_orders_deleted ON orders(deleted_at);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_timestamp ON orders(timestamp);
CREATE INDEX idx_orders_updated_at ON orders(updated_at);

-- RLS
ALTER TABLE store_info ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_store_info" ON store_info FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_categories" ON categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_orders" ON orders FOR ALL USING (true) WITH CHECK (true);
"""


def main():
    print("=" * 60)
    print("  Pushing POS schema to Supabase")
    print("=" * 60)
    print(f"Host: {DB_HOST}")
    print(f"User: {DB_USER}")
    print()

    print("[1/3] Connecting...")
    conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD, connect_timeout=15)
    conn.autocommit = True
    cur = conn.cursor()
    print("  Connected ✓")

    print()
    print("[2/3] Creating schema...")
    cur.execute(SCHEMA_SQL)
    print("  Schema created ✓ (4 tables, 7 indexes, RLS policies)")

    print()
    print("[3/3] Seeding data...")
    now_ms = int(time.time() * 1000)

    # Store info
    store_data = [
        ("name", json.dumps("Naseeb Biryani and Pakwan Center")),
        ("address", json.dumps("Model Colony, Karachi, Pakistan")),
        ("phone", json.dumps("03161084780")),
        ("email", json.dumps("شادی اور تقریبات کے لیے آپ کا بھروسہ")),
        ("receiptHeader", json.dumps("آپ کی تقریب، ہمارا کمال")),
        ("receiptFooter", json.dumps("Thank you for your visit!")),
    ]
    for key, value in store_data:
        cur.execute(
            "INSERT INTO store_info (key, value, updated_at, sync_version) VALUES (%s, %s, %s, 1)",
            (key, value, now_ms)
        )
    print(f"  ✓ store_info: {len(store_data)} rows")

    # Categories
    categories = [
        (10, "Chicken Tikka Biryani", "#0078c2", "🍗", 0),
        (15, "Beef Yakhni Pulao", "#000000", "🥘", 1),
        (16, "Beef Biryani", "#4dff61", "🍖", 2),
        (18, "Saadi Biryani", "#d4ff00", "🍲", 3),
        (19, "Raita and Salad", "#ff00ea", "🥗", 4),
        (20, "Drink", "#3B82F6", "🥤", 5),
        (21, "Sada pulao", "#CD853F", "🥣", 6),
    ]
    for cid, name, color, emoji, pos in categories:
        cur.execute(
            "INSERT INTO categories (id, name, color, emoji, position, updated_at, sync_version) VALUES (%s, %s, %s, %s, %s, %s, 1)",
            (cid, name, color, emoji, pos, now_ms)
        )
    print(f"  ✓ categories: {len(categories)} rows")

    # Products
    products = [
        (1, "Chicken Tikka Biryani", 10, 160, "1 Pao"), (2, "Chicken Tikka Biryani", 10, 220, "Dedh Pao"),
        (3, "Chicken Tikka Biryani", 10, 270, "1 Boti Adha Kilo"), (4, "Chicken Tikka Biryani", 10, 320, "Adha Kilo Double"),
        (5, "Chicken Tikka Biryani", 10, 480, "3 Pao"), (6, "Chicken Tikka Biryani", 10, 640, "1 Kg"),
        (7, "Beef Yakhni Pulao", 15, 180, "1 Pao"), (8, "Beef Yakhni Pulao", 15, 270, "Dedh Pao"),
        (9, "Beef Yakhni Pulao", 15, 360, "Adha Kilo Double"), (10, "Beef Yakhni Pulao", 15, 540, "3 Pao"),
        (11, "Beef Yakhni Pulao", 15, 720, "1 Kg"),
        (12, "Beef Biryani", 16, 180, "1 Pao"), (13, "Beef Biryani", 16, 270, "Dedh Pao"),
        (14, "Beef Biryani", 16, 360, "Adha Kilo Double"), (15, "Beef Biryani", 16, 540, "3 Pao"),
        (16, "Beef Biryani", 16, 720, "1 Kg"), (17, "Chana Pulao", 16, 160, "1 Pao"), (18, "Chana Pulao", 16, 240, "Dedh Pao"),
        (19, "Saadi Biryani", 18, 130, "1 Pao"), (20, "Saadi Biryani", 18, 200, "Dedh Pao"),
        (21, "Saadi Biryani", 18, 270, "Adha Kilo Double"),
        (22, "Raita", 19, 40, "Small"), (23, "Fresh Salad", 19, 40, "Plate"), (24, "Shami Kabab", 19, 60, "1 Piece"),
        (25, "Pepsi", 20, 60, "250ml"), (26, "Pepsi", 20, 90, "500ml"), (27, "Pepsi", 20, 130, "1L"),
        (28, "Pepsi", 20, 180, "1.5L"), (29, "Mineral Water", 20, 50, "Small"), (30, "Mineral Water", 20, 100, "Large"),
        (31, "7 Up", 20, 60, "250ml"), (32, "7 Up", 20, 90, "500ml"),
        (33, "Mirinda", 20, 60, "250ml"), (34, "Mirinda", 20, 90, "500ml"),
        (35, "Sada Pulao", 21, 130, "1 Pao"), (36, "Sada Pulao", 21, 200, "Dedh Pao"),
    ]
    for pid, name, cat, price, qty in products:
        cur.execute(
            "INSERT INTO products (id, name, category_id, price, quantity_type, is_custom, updated_at, sync_version) VALUES (%s, %s, %s, %s, %s, 0, %s, 1)",
            (pid, name, cat, price, qty, now_ms)
        )
    print(f"  ✓ products: {len(products)} rows")

    # Reset sequences
    cur.execute("SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories))")
    cur.execute("SELECT setval('products_id_seq', (SELECT MAX(id) FROM products))")
    cur.execute("SELECT setval('orders_id_seq', 1, false)")
    print("  ✓ sequences reset")

    # Verify
    print()
    print("=" * 60)
    print("  VERIFICATION")
    print("=" * 60)
    for table in ["store_info", "categories", "products", "orders"]:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        count = cur.fetchone()[0]
        print(f"  {table}: {count} rows")

    cur.close()
    conn.close()
    print()
    print("✓ Schema pushed + data seeded to Supabase successfully!")
    print("  The POS backend can now use Supabase as the online DB.")


if __name__ == "__main__":
    main()
