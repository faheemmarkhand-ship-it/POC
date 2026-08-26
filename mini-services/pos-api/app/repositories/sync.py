"""Sync repository: push/pull with conflict detection.

Conflict rule:
  If a record has an `id`, we check the server-side row.
  - If server row exists and (server.updated_at > incoming.updated_at) or
    (server.sync_version != incoming.sync_version): treat as conflict (skip, return).
  - Otherwise upsert.
  For records without an id (client-created), insert new.
"""
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Category, Order, Product, StoreInfo
from ..utils import now_ms
from . import categories as cat_repo
from . import orders as order_repo
from . import products as prod_repo
from . import store_info as si_repo

# Map of table name -> (model, upsert_fn)
_TABLE_MAP = {
    "categories": (Category, cat_repo.upsert_for_sync),
    "products": (Product, prod_repo.upsert_for_sync),
    "orders": (Order, order_repo.upsert_for_sync),
    "store_info": (None, si_repo.upsert_for_sync),
}


def _get_existing(db: Session, table: str, rec: dict):
    """Return the server-side row for this record's id (or key for store_info), or None."""
    if table == "store_info":
        key = rec.get("key")
        if key is None:
            return None
        return db.get(StoreInfo, key)
    model, _ = _TABLE_MAP[table]
    rid = rec.get("id")
    if rid is None:
        return None
    return db.get(model, int(rid))


def push(db: Session, payload: dict) -> dict:
    changes = payload.get("changes", {}) or {}
    applied = {k: 0 for k in _TABLE_MAP}
    conflicts: list[dict] = []
    server_time = now_ms()

    for table_name, (model, upsert_fn) in _TABLE_MAP.items():
        recs = changes.get(table_name) or []
        for rec in recs:
            try:
                existing = _get_existing(db, table_name, rec)
                incoming_updated_at = int(rec.get("updated_at") or 0)
                incoming_sync_version = int(rec.get("sync_version") or 0)

                if existing is not None:
                    server_updated_at = int(getattr(existing, "updated_at", 0) or 0)
                    server_sync_version = int(getattr(existing, "sync_version", 0) or 0)
                    # Conflict if server is strictly newer, OR sync_version differs.
                    if server_updated_at > incoming_updated_at or server_sync_version != incoming_sync_version:
                        # Only treat as conflict if either side actually has changes
                        # (i.e. incoming isn't identical to server).
                        # Skip identical-records: still treat as applied (no-op).
                        if (server_updated_at == incoming_updated_at
                                and server_sync_version == incoming_sync_version):
                            applied[table_name] += 1
                            continue
                        # Build conflict record for client
                        conflicts.append({
                            "table": table_name,
                            "id": rec.get("id") if table_name != "store_info" else rec.get("key"),
                            "client_record": rec,
                            "server_record": _serialize_row(existing, table_name),
                            "reason": "server_newer_or_version_mismatch",
                        })
                        continue

                # Apply upsert.
                upsert_fn(db, rec)
                applied[table_name] += 1
            except Exception as e:  # pragma: no cover
                conflicts.append({
                    "table": table_name,
                    "id": rec.get("id") if table_name != "store_info" else rec.get("key"),
                    "error": str(e),
                })
    db.commit()
    return {"applied": applied, "conflicts": conflicts, "server_time": server_time}


def pull(db: Session, since: int) -> dict:
    server_time = now_ms()
    out = {
        "categories": [],
        "products": [],
        "orders": [],
        "store_info": [],
        "server_time": server_time,
    }

    # categories
    for r in db.execute(select(Category).where(Category.updated_at > since)).scalars().all():
        out["categories"].append({
            "id": r.id, "name": r.name, "color": r.color, "emoji": r.emoji,
            "position": r.position, "updated_at": r.updated_at,
            "deleted_at": r.deleted_at, "sync_version": r.sync_version,
        })
    for r in db.execute(select(Product).where(Product.updated_at > since)).scalars().all():
        out["products"].append({
            "id": r.id, "name": r.name, "categoryId": r.category_id, "price": r.price,
            "quantityType": r.quantity_type, "isCustom": r.is_custom,
            "updated_at": r.updated_at, "deleted_at": r.deleted_at,
            "sync_version": r.sync_version,
        })
    for r in db.execute(select(Order).where(Order.updated_at > since)).scalars().all():
        # Parse items_json for client convenience.
        try:
            import json as _j
            items = _j.loads(r.items_json) if r.items_json else []
        except Exception:
            items = []
        out["orders"].append({
            "id": r.id, "timestamp": r.timestamp, "total": r.total,
            "status": r.status, "items": items,
            "items_json": r.items_json,
            "updated_at": r.updated_at, "deleted_at": r.deleted_at,
            "sync_version": r.sync_version,
        })
    for r in db.execute(select(StoreInfo).where(StoreInfo.updated_at > since)).scalars().all():
        out["store_info"].append({
            "key": r.key, "value": r.value,
            "updated_at": r.updated_at, "deleted_at": r.deleted_at,
            "sync_version": r.sync_version,
        })
    return out


def _serialize_row(row, table_name: str) -> dict:
    """Convert ORM row to dict (for conflict reporting)."""
    if row is None:
        return {}
    if table_name == "store_info":
        return {
            "key": row.key, "value": row.value,
            "updated_at": row.updated_at, "deleted_at": row.deleted_at,
            "sync_version": row.sync_version,
        }
    if table_name == "categories":
        return {
            "id": row.id, "name": row.name, "color": row.color, "emoji": row.emoji,
            "position": row.position, "updated_at": row.updated_at,
            "deleted_at": row.deleted_at, "sync_version": row.sync_version,
        }
    if table_name == "products":
        return {
            "id": row.id, "name": row.name, "categoryId": row.category_id,
            "price": row.price, "quantityType": row.quantity_type,
            "isCustom": row.is_custom, "updated_at": row.updated_at,
            "deleted_at": row.deleted_at, "sync_version": row.sync_version,
        }
    if table_name == "orders":
        return {
            "id": row.id, "timestamp": row.timestamp, "total": row.total,
            "status": row.status, "items_json": row.items_json,
            "updated_at": row.updated_at, "deleted_at": row.deleted_at,
            "sync_version": row.sync_version,
        }
    return {}
