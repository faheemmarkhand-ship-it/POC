"""Orders repository."""
import json
from typing import Any, Optional

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from ..models import Order
from ..utils import now_ms

NINE_HOURS_MS = 9 * 3600 * 1000  # business-day shift
DEFAULT_LIMIT = 5000


def _parse_items(items_json: str | None) -> Any:
    if not items_json:
        return []
    try:
        return json.loads(items_json)
    except (ValueError, TypeError):
        return []


def _to_out(row: Order) -> dict:
    return {
        "id": row.id,
        "timestamp": row.timestamp,
        "total": row.total,
        "status": row.status,
        "items_json": _parse_items(row.items_json),
    }


def list_orders(db: Session, *, status: str | None = None, month: str | None = None,
                date: str | None = None, limit: int = DEFAULT_LIMIT,
                search: str | None = None) -> list[dict]:
    """List orders. Apply 9-hour business-day shift for month/date filters.

    - month filter: "YYYY-MM" -> orders whose shifted day falls within that month.
    - date filter: "YYYY-MM-DD" -> orders whose shifted day equals that date.
    - search: case-insensitive contains on "ORD-<id>" formatted string.
    - Default sort timestamp DESC.
    """
    stmt = select(Order).where(Order.deleted_at.is_(None))

    if status:
        stmt = stmt.where(Order.status == status)

    # Business-day shift: group orders using (timestamp - 9h) as the day boundary.
    # We compute strftime on the shifted timestamp for SQLite.
    if date:
        # filter by date string YYYY-MM-DD
        stmt = stmt.where(
            func.strftime("%Y-%m-%d", func.datetime((Order.timestamp - NINE_HOURS_MS) / 1000, "unixepoch")) == date
        )
    elif month:
        stmt = stmt.where(
            func.strftime("%Y-%m", func.datetime((Order.timestamp - NINE_HOURS_MS) / 1000, "unixepoch")) == month
        )

    if search:
        # Match ORD-XXX format (zero-padded to 3 digits), case-insensitive contains.
        # We do this filter in Python for cross-DB portability (avoids SQLite-only printf/||).
        s = search.lower()
        stmt = stmt.order_by(Order.timestamp.desc())
        # Fetch all (no limit yet), filter, then apply limit.
        rows = db.execute(stmt).scalars().all()
        filtered = []
        for r in rows:
            label = f"ord-{int(r.id):03d}".lower()
            if s in label:
                filtered.append(r)
            if len(filtered) >= limit:
                break
        return [_to_out(r) for r in filtered]

    stmt = stmt.order_by(Order.timestamp.desc()).limit(limit)
    rows = db.execute(stmt).scalars().all()
    return [_to_out(r) for r in rows]


def create(db: Session, *, timestamp: int, total: float, status: str,
           items: list[Any]) -> dict:
    ts = now_ms()
    row = Order(
        timestamp=timestamp,
        total=total,
        status=status,
        items_json=json.dumps(items, ensure_ascii=False) if items is not None else "[]",
        updated_at=ts,
        sync_version=1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _to_out(row)


def update_status(db: Session, oid: int, status: str) -> Optional[dict]:
    row = db.get(Order, oid)
    if row is None or row.deleted_at is not None:
        return None
    ts = now_ms()
    row.status = status
    row.updated_at = ts
    row.sync_version = (row.sync_version or 0) + 1
    db.commit()
    db.refresh(row)
    return _to_out(row)


def hard_delete(db: Session, oid: int) -> bool:
    row = db.get(Order, oid)
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True


def clear_all(db: Session) -> None:
    """Delete all orders + reset sqlite_sequence (autoincrement). Matches original clearAllOrders."""
    db.execute(delete(Order))
    db.commit()
    # Reset autoincrement for SQLite.
    try:
        db.execute(text("DELETE FROM sqlite_sequence WHERE name='orders'"))
        db.commit()
    except Exception:
        # not sqlite (e.g. postgres); use TRUNCATE-ish fallback
        db.rollback()


def upsert_for_sync(db: Session, rec: dict) -> None:
    oid = rec.get("id")
    if oid is None:
        return
    ts = now_ms()
    row = db.get(Order, int(oid))
    items = rec.get("items")
    if items is None:
        items_json = rec.get("items_json")
    else:
        items_json = json.dumps(items, ensure_ascii=False) if isinstance(items, list) else items
    if row is None:
        row = Order(
            id=int(oid),
            timestamp=rec.get("timestamp"),
            total=rec.get("total"),
            status=rec.get("status"),
            items_json=items_json,
            updated_at=int(rec.get("updated_at") or ts),
            deleted_at=rec.get("deleted_at"),
            sync_version=int(rec.get("sync_version") or 1),
        )
        db.add(row)
    else:
        row.timestamp = rec.get("timestamp", row.timestamp)
        if rec.get("total") is not None:
            row.total = rec.get("total")
        if rec.get("status") is not None:
            row.status = rec.get("status")
        if items_json is not None:
            row.items_json = items_json
        row.updated_at = int(rec.get("updated_at") or ts)
        row.deleted_at = rec.get("deleted_at")
        row.sync_version = int(rec.get("sync_version") or (row.sync_version or 0) + 1)
    db.flush()


def stats_filter(db: Session, *, status: str | None = None, month: str | None = None,
                 date: str | None = None) -> dict:
    """Compute revenue & order count for a filter (with 9-hour shift applied)."""
    stmt = select(Order).where(Order.deleted_at.is_(None))
    if status:
        stmt = stmt.where(Order.status == status)
    if date:
        stmt = stmt.where(
            func.strftime("%Y-%m-%d", func.datetime((Order.timestamp - NINE_HOURS_MS) / 1000, "unixepoch")) == date
        )
    elif month:
        stmt = stmt.where(
            func.strftime("%Y-%m", func.datetime((Order.timestamp - NINE_HOURS_MS) / 1000, "unixepoch")) == month
        )
    rows = db.execute(stmt).scalars().all()
    revenue = 0.0
    for r in rows:
        if r.total is not None:
            revenue += float(r.total)
    return {"revenue": revenue, "orders": len(rows)}


def returned_filter(db: Session, *, month: str | None = None, date: str | None = None) -> dict:
    """returnedCount/returnedValue: status='returned', filtered by month/date (9-hour shift)."""
    stmt = select(Order).where(Order.deleted_at.is_(None), Order.status == "returned")
    if date:
        stmt = stmt.where(
            func.strftime("%Y-%m-%d", func.datetime((Order.timestamp - NINE_HOURS_MS) / 1000, "unixepoch")) == date
        )
    elif month:
        stmt = stmt.where(
            func.strftime("%Y-%m", func.datetime((Order.timestamp - NINE_HOURS_MS) / 1000, "unixepoch")) == month
        )
    rows = db.execute(stmt).scalars().all()
    value = 0.0
    for r in rows:
        if r.total is not None:
            value += float(r.total)
    return {"returnedCount": len(rows), "returnedValue": value}


def iter_for_pull(db: Session, since: int):
    """Yield rows with updated_at > since (includes soft-deleted for delete sync)."""
    return db.execute(
        select(Order).where(Order.updated_at > since)
    ).scalars().all()


def count(db: Session) -> int:
    return db.execute(select(func.count(Order.id))).scalar_one() or 0
