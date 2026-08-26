"""Seed service: imports seed_data.json into the backend DB on first run.

Seed data format:
  {"store_info": {"columns": [...], "rows": [...]},
   "categories": {...}, "products": {...}, "orders": {...}}

Notes:
  - store_info values in the seed are JSON-encoded strings (e.g. '"hello"' for
    a string value). We store them verbatim (as TEXT) — the same format the
    original SQLite stored. The /api/store-info GET endpoint parses them with
    json.loads so callers see plain strings.
  - All other tables: store rows with their original ids (preserving them),
    set updated_at to the order's timestamp (for orders) or current epoch ms
    (for store_info/categories/products), deleted_at=NULL, sync_version=1.
"""
import json
import logging
from pathlib import Path

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from .. import config
from ..db import Base, SessionLocal, engine
from ..models import Category, Order, Product, StoreInfo
from ..utils import now_ms

log = logging.getLogger("pos_api.seed")


def _load_seed(path: Path) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def is_seeded(db: Session) -> bool:
    """True if any data is already present."""
    counts = (
        db.execute(select(StoreInfo)).first() is not None
        or db.execute(select(Category)).first() is not None
        or db.execute(select(Product)).first() is not None
        or db.execute(select(Order)).first() is not None
    )
    return bool(counts)


def seed(force: bool = False) -> dict:
    """Create tables and import seed data. Returns a summary dict.

    Idempotent: if data already present and force=False, returns counts without re-importing.
    """
    # Always create tables first.
    Base.metadata.create_all(bind=engine)

    if not config.SEED_DATA_PATH.exists():
        msg = f"seed data not found at {config.SEED_DATA_PATH}; skipping seed."
        log.warning(msg)
        return {"seeded": False, "reason": msg}

    with SessionLocal() as db:
        if is_seeded(db) and not force:
            counts = _counts(db)
            log.info("DB already seeded (counts=%s); skipping.", counts)
            return {"seeded": False, "already_seeded": True, "counts": counts}

        data = _load_seed(config.SEED_DATA_PATH)
        ts = now_ms()
        summary = {"store_info": 0, "categories": 0, "products": 0, "orders": 0}

        # --- store_info ---
        si = data.get("store_info", {})
        cols = si.get("columns", [])
        for row in si.get("rows", []):
            rec = dict(zip(cols, row))
            key = rec.get("key")
            value = rec.get("value")
            if key is None:
                continue
            existing = db.get(StoreInfo, key)
            if existing:
                continue
            db.add(StoreInfo(
                key=key,
                value=value,  # already JSON-encoded string in seed
                updated_at=ts,
                sync_version=1,
            ))
            summary["store_info"] += 1

        # --- categories ---
        cat = data.get("categories", {})
        cols = cat.get("columns", [])
        for row in cat.get("rows", []):
            rec = dict(zip(cols, row))
            cid = rec.get("id")
            if cid is None:
                continue
            existing = db.get(Category, int(cid))
            if existing:
                continue
            db.add(Category(
                id=int(cid),
                name=rec.get("name"),
                color=rec.get("color"),
                emoji=rec.get("emoji"),
                position=int(rec.get("position") or 0) if "position" in rec else 0,
                updated_at=ts,
                sync_version=1,
            ))
            summary["categories"] += 1

        # --- products ---
        prod = data.get("products", {})
        cols = prod.get("columns", [])
        for row in prod.get("rows", []):
            rec = dict(zip(cols, row))
            pid = rec.get("id")
            if pid is None:
                continue
            existing = db.get(Product, int(pid))
            if existing:
                continue
            db.add(Product(
                id=int(pid),
                name=rec.get("name"),
                category_id=rec.get("category_id"),
                price=rec.get("price"),
                quantity_type=rec.get("quantity_type"),
                is_custom=int(rec.get("is_custom") or 0),
                updated_at=ts,
                sync_version=1,
            ))
            summary["products"] += 1

        # --- orders ---
        ord_data = data.get("orders", {})
        cols = ord_data.get("columns", [])
        # Determine column indices once.
        idx_id = cols.index("id") if "id" in cols else 0
        idx_ts = cols.index("timestamp") if "timestamp" in cols else 1
        idx_total = cols.index("total") if "total" in cols else 2
        idx_status = cols.index("status") if "status" in cols else 3
        idx_items = cols.index("items_json") if "items_json" in cols else 4
        # For SQLite WAL, batch commit every 500 rows for speed.
        BATCH = 500
        count = 0
        for i, row in enumerate(ord_data.get("rows", [])):
            oid = row[idx_id]
            if oid is None:
                continue
            existing = db.get(Order, int(oid))
            if existing:
                continue
            order_ts = int(row[idx_ts]) if row[idx_ts] is not None else ts
            db.add(Order(
                id=int(oid),
                timestamp=order_ts,
                total=float(row[idx_total]) if row[idx_total] is not None else 0.0,
                status=row[idx_status],
                items_json=row[idx_items],
                updated_at=order_ts,  # use order timestamp as updated_at for sync baseline
                sync_version=1,
            ))
            count += 1
            summary["orders"] += 1
            if count % BATCH == 0:
                db.commit()
        db.commit()

        # Update sqlite_sequence so future inserts continue past max id.
        max_id = db.execute(select(Order.id).order_by(Order.id.desc()).limit(1)).first()
        if max_id:
            from sqlalchemy import text
            try:
                db.execute(text(f"INSERT OR REPLACE INTO sqlite_sequence(name, seq) VALUES ('orders', {int(max_id[0])})"))
                db.commit()
            except Exception:
                db.rollback()

        log.info("Seed complete: %s", summary)
        return {"seeded": True, "counts": _counts(db), "inserted": summary}


def _counts(db: Session) -> dict:
    from sqlalchemy import func
    return {
        "store_info": db.execute(select(func.count(StoreInfo.key))).scalar_one(),
        "categories": db.execute(select(func.count(Category.id))).scalar_one(),
        "products": db.execute(select(func.count(Product.id))).scalar_one(),
        "orders": db.execute(select(func.count(Order.id))).scalar_one(),
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(seed())
