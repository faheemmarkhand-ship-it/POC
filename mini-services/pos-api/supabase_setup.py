"""
Supabase setup script for Naseeb Biryani POS.

Usage:
    cd mini-services/pos-api
    .venv/bin/python supabase_setup.py

This script:
1. Tests the Supabase connection with the anon/publishable key.
2. Checks if the tables exist.
3. If they don't, prints the SQL to run in the Supabase dashboard.
4. If they do, seeds the data (store_info, categories, products) via REST.
"""
import os
import sys
import json
import time
from pathlib import Path

# Supabase credentials (from the user)
SUPABASE_URL = os.environ.get(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://tiybeuglcubkndufyisp.supabase.co",
)
SUPABASE_KEY = os.environ.get(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_pqBNliqYZs1hTq-O4Cb4ow_wEZIABye",
)

def main():
    print("=" * 60)
    print("  Naseeb POS — Supabase Setup")
    print("=" * 60)
    print(f"URL: {SUPABASE_URL}")
    print(f"Key: {SUPABASE_KEY[:20]}...")
    print()

    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase package not installed.")
        print("Run: uv pip install supabase")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. Test connection + check if tables exist
    print("[1/4] Testing connection + checking tables...")
    try:
        r = sb.table("store_info").select("key").limit(1).execute()
        print(f"  ✓ store_info table exists ({len(r.data)} rows)")
        tables_exist = True
    except Exception as e:
        msg = str(e)
        if "Could not find the table" in msg or "PGRST205" in msg:
            print("  ✗ Tables do not exist yet in Supabase.")
            tables_exist = False
        else:
            print(f"  ✗ Connection error: {msg}")
            sys.exit(1)

    if not tables_exist:
        print()
        print("[2/4] TABLES NOT FOUND — you need to create them manually.")
        print()
        print("  Steps:")
        print("    1. Open: https://supabase.com/dashboard/project/tiybeuglcubkndufyisp/sql/new")
        print("    2. Paste the entire contents of:")
        print(f"       {Path(__file__).parent / 'supabase_schema.sql'}")
        print("    3. Click Run (▶)")
        print("    4. Re-run this script: .venv/bin/python supabase_setup.py")
        print()
        sys.exit(0)

    # 3. Seed data
    print()
    print("[2/4] Seeding store_info...")
    now_ms = int(time.time() * 1000)
    store_data = [
        {"key": "name", "value": json.dumps("Naseeb Biryani and Pakwan Center"), "updated_at": now_ms, "sync_version": 1},
        {"key": "address", "value": json.dumps("Model Colony, Karachi, Pakistan"), "updated_at": now_ms, "sync_version": 1},
        {"key": "phone", "value": json.dumps("03161084780"), "updated_at": now_ms, "sync_version": 1},
        {"key": "email", "value": json.dumps("شادی اور تقریبات کے لیے آپ کا بھروسہ"), "updated_at": now_ms, "sync_version": 1},
        {"key": "receiptHeader", "value": json.dumps("آپ کی تقریب، ہمارا کمال"), "updated_at": now_ms, "sync_version": 1},
        {"key": "receiptFooter", "value": json.dumps("Thank you for your visit!"), "updated_at": now_ms, "sync_version": 1},
    ]
    for row in store_data:
        try:
            sb.table("store_info").upsert(row, on_conflict="key").execute()
        except Exception as e:
            print(f"  ! store_info {row['key']}: {e}")
    print(f"  ✓ {len(store_data)} store_info rows upserted")

    print()
    print("[3/4] Seeding categories...")
    categories = [
        {"id": 10, "name": "Chicken Tikka Biryani", "color": "#0078c2", "emoji": "🍗", "position": 0, "updated_at": now_ms, "sync_version": 1},
        {"id": 15, "name": "Beef Yakhni Pulao", "color": "#000000", "emoji": "🥘", "position": 1, "updated_at": now_ms, "sync_version": 1},
        {"id": 16, "name": "Beef Biryani", "color": "#4dff61", "emoji": "🍖", "position": 2, "updated_at": now_ms, "sync_version": 1},
        {"id": 18, "name": "Saadi Biryani", "color": "#d4ff00", "emoji": "🍲", "position": 3, "updated_at": now_ms, "sync_version": 1},
        {"id": 19, "name": "Raita and Salad", "color": "#ff00ea", "emoji": "🥗", "position": 4, "updated_at": now_ms, "sync_version": 1},
        {"id": 20, "name": "Drink", "color": "#3B82F6", "emoji": "🥤", "position": 5, "updated_at": now_ms, "sync_version": 1},
        {"id": 21, "name": "Sada pulao", "color": "#CD853F", "emoji": "🥣", "position": 6, "updated_at": now_ms, "sync_version": 1},
    ]
    for row in categories:
        try:
            sb.table("categories").upsert(row, on_conflict="id").execute()
        except Exception as e:
            print(f"  ! category {row['id']}: {e}")
    print(f"  ✓ {len(categories)} categories upserted")

    print()
    print("[4/4] Seeding products...")
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
        try:
            sb.table("products").upsert({
                "id": pid, "name": name, "category_id": cat, "price": price,
                "quantity_type": qty, "is_custom": 0, "updated_at": now_ms, "sync_version": 1,
            }, on_conflict="id").execute()
        except Exception as e:
            print(f"  ! product {pid}: {e}")
    print(f"  ✓ {len(products)} products upserted")

    # Verify
    print()
    print("=" * 60)
    print("  VERIFICATION")
    print("=" * 60)
    for table in ["store_info", "categories", "products", "orders"]:
        try:
            r = sb.table(table).select("*", count="exact").limit(0).execute()
            count = r.count if hasattr(r, "count") else len(r.data)
            print(f"  {table}: {count} rows")
        except Exception as e:
            print(f"  {table}: ERROR — {e}")
    print()
    print("✓ Supabase setup complete! The POS backend can now use it as the online DB.")


if __name__ == "__main__":
    main()
