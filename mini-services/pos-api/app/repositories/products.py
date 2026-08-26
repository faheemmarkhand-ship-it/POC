"""Products repository."""
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Product
from ..utils import now_ms


def list_active(db: Session) -> list[Product]:
    rows = db.execute(
        select(Product).where(Product.deleted_at.is_(None)).order_by(Product.id.asc())
    ).scalars().all()
    return list(rows)


def get(db: Session, pid: int) -> Optional[Product]:
    return db.get(Product, pid)


def create(db: Session, name: str | None, category_id: int | None, price: float | None,
           quantity_type: str | None, is_custom: int = 0) -> Product:
    ts = now_ms()
    row = Product(
        name=name,
        category_id=category_id,
        price=price,
        quantity_type=quantity_type,
        is_custom=int(is_custom or 0),
        updated_at=ts,
        sync_version=1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update(db: Session, pid: int, name: str | None, category_id: int | None,
           price: float | None, quantity_type: str | None, is_custom: int = 0) -> Optional[Product]:
    row = db.get(Product, pid)
    if row is None or row.deleted_at is not None:
        return None
    ts = now_ms()
    if name is not None:
        row.name = name
    if category_id is not None:
        row.category_id = category_id
    if price is not None:
        row.price = price
    if quantity_type is not None:
        row.quantity_type = quantity_type
    if is_custom is not None:
        row.is_custom = int(is_custom)
    row.updated_at = ts
    row.sync_version = (row.sync_version or 0) + 1
    db.commit()
    db.refresh(row)
    return row


def soft_delete(db: Session, pid: int) -> bool:
    row = db.get(Product, pid)
    if row is None or row.deleted_at is not None:
        return False
    ts = now_ms()
    row.deleted_at = ts
    row.updated_at = ts
    row.sync_version = (row.sync_version or 0) + 1
    db.commit()
    return True


def upsert_for_sync(db: Session, rec: dict) -> None:
    pid = rec.get("id")
    if pid is None:
        return
    ts = now_ms()
    row = db.get(Product, int(pid))
    if row is None:
        row = Product(
            id=int(pid),
            name=rec.get("name"),
            category_id=rec.get("categoryId") or rec.get("category_id"),
            price=rec.get("price"),
            quantity_type=rec.get("quantityType") or rec.get("quantity_type"),
            is_custom=int(rec.get("isCustom") if rec.get("isCustom") is not None else (rec.get("is_custom") or 0)),
            updated_at=int(rec.get("updated_at") or ts),
            deleted_at=rec.get("deleted_at"),
            sync_version=int(rec.get("sync_version") or 1),
        )
        db.add(row)
    else:
        row.name = rec.get("name", row.name)
        row.category_id = rec.get("categoryId") or rec.get("category_id") or row.category_id
        if rec.get("price") is not None:
            row.price = rec.get("price")
        if rec.get("quantityType") is not None or rec.get("quantity_type") is not None:
            row.quantity_type = rec.get("quantityType") or rec.get("quantity_type")
        if rec.get("isCustom") is not None or rec.get("is_custom") is not None:
            row.is_custom = int(rec.get("isCustom") if rec.get("isCustom") is not None else rec.get("is_custom", 0))
        row.updated_at = int(rec.get("updated_at") or ts)
        row.deleted_at = rec.get("deleted_at")
        row.sync_version = int(rec.get("sync_version") or (row.sync_version or 0) + 1)
    db.flush()
