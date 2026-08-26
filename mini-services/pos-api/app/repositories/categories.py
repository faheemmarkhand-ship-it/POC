"""Categories repository."""
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Category, Product
from ..utils import now_ms


def list_active(db: Session) -> list[Category]:
    rows = db.execute(
        select(Category)
        .where(Category.deleted_at.is_(None))
        .order_by(Category.position.asc(), Category.id.asc())
    ).scalars().all()
    return list(rows)


def get(db: Session, cid: int) -> Optional[Category]:
    return db.get(Category, cid)


def create(db: Session, name: str | None, color: str | None, emoji: str | None) -> Category:
    ts = now_ms()
    # next position = max(position)+1 among non-deleted
    max_pos = db.execute(
        select(func.max(Category.position)).where(Category.deleted_at.is_(None))
    ).scalar_one()
    next_pos = (max_pos or -1) + 1
    row = Category(
        name=name,
        color=color,
        emoji=emoji,
        position=next_pos,
        updated_at=ts,
        sync_version=1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def update(db: Session, cid: int, name: str | None, color: str | None, emoji: str | None) -> Optional[Category]:
    row = db.get(Category, cid)
    if row is None or row.deleted_at is not None:
        return None
    ts = now_ms()
    if name is not None:
        row.name = name
    if color is not None:
        row.color = color
    if emoji is not None:
        row.emoji = emoji
    row.updated_at = ts
    row.sync_version = (row.sync_version or 0) + 1
    db.commit()
    db.refresh(row)
    return row


def soft_delete(db: Session, cid: int) -> tuple[bool, str | None, int]:
    """Returns (success, error_message, product_count_of_category)."""
    row = db.get(Category, cid)
    if row is None or row.deleted_at is not None:
        return False, "Category not found", 0
    # count non-deleted products in this category
    prod_count = db.execute(
        select(func.count(Product.id)).where(
            Product.category_id == cid, Product.deleted_at.is_(None)
        )
    ).scalar_one()
    if prod_count > 0:
        return False, "Cannot delete category: It still contains products", prod_count
    ts = now_ms()
    row.deleted_at = ts
    row.updated_at = ts
    row.sync_version = (row.sync_version or 0) + 1
    db.commit()
    return True, None, 0


def reorder(db: Session, id_order_map: dict[str, int]) -> None:
    ts = now_ms()
    for sid, pos in id_order_map.items():
        try:
            cid = int(sid)
        except (ValueError, TypeError):
            continue
        row = db.get(Category, cid)
        if row is None or row.deleted_at is not None:
            continue
        row.position = int(pos)
        row.updated_at = ts
        row.sync_version = (row.sync_version or 0) + 1
    db.commit()


def upsert_for_sync(db: Session, rec: dict) -> None:
    """Raw upsert used by sync engine."""
    cid = rec.get("id")
    if cid is None:
        return
    row = db.get(Category, int(cid))
    ts = now_ms()
    if row is None:
        row = Category(
            id=int(cid),
            name=rec.get("name"),
            color=rec.get("color"),
            emoji=rec.get("emoji"),
            position=int(rec.get("position") or 0),
            updated_at=int(rec.get("updated_at") or ts),
            deleted_at=rec.get("deleted_at"),
            sync_version=int(rec.get("sync_version") or 1),
        )
        db.add(row)
    else:
        row.name = rec.get("name", row.name)
        row.color = rec.get("color", row.color)
        row.emoji = rec.get("emoji", row.emoji)
        if "position" in rec and rec["position"] is not None:
            row.position = int(rec["position"])
        row.updated_at = int(rec.get("updated_at") or ts)
        row.deleted_at = rec.get("deleted_at")
        row.sync_version = int(rec.get("sync_version") or (row.sync_version or 0) + 1)
    db.flush()
