"""Store_info repository: key/value config store.

Values stored as TEXT; the original app JSON-encodes string values so they
can be parsed back into strings/numbers/objects. We preserve that contract:
raw stored value is TEXT (already JSON-encoded by the caller layer in PUT),
and GET parses each value via json.loads.
"""
import json
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import StoreInfo
from ..utils import now_ms


def get_all(db: Session) -> dict[str, Any]:
    """Return {key: parsedValue, ...} (only non-deleted rows)."""
    rows = db.execute(
        select(StoreInfo).where(StoreInfo.deleted_at.is_(None))
    ).scalars().all()
    out: dict[str, Any] = {}
    for r in rows:
        out[r.key] = _parse_value(r.value)
    return out


def _parse_value(v: str | None) -> Any:
    if v is None or v == "":
        return ""
    try:
        return json.loads(v)
    except (ValueError, TypeError):
        return v


def upsert_many(db: Session, payload: dict[str, Any]) -> dict[str, Any]:
    """Upsert each key/value. Caller-supplied values are JSON-encoded for storage."""
    ts = now_ms()
    existing = {r.key: r for r in db.execute(select(StoreInfo)).scalars().all()}
    for k, v in payload.items():
        encoded = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
        if k in existing:
            row = existing[k]
            row.value = encoded
            row.updated_at = ts
            row.deleted_at = None  # un-delete if re-added
            row.sync_version = (row.sync_version or 0) + 1
        else:
            row = StoreInfo(
                key=k,
                value=encoded,
                updated_at=ts,
                sync_version=1,
            )
            db.add(row)
    db.commit()
    return get_all(db)


def upsert_for_sync(db: Session, key: str, value: str | None, updated_at: int,
                    deleted_at: int | None, sync_version: int) -> None:
    """Raw upsert used by sync engine (keeps provided sync metadata)."""
    row = db.get(StoreInfo, key)
    if row is None:
        row = StoreInfo(key=key, value=value, updated_at=updated_at or ts_fallback(),
                        deleted_at=deleted_at, sync_version=sync_version or 1)
        db.add(row)
    else:
        row.value = value
        row.updated_at = updated_at or row.updated_at
        row.deleted_at = deleted_at
        row.sync_version = sync_version or (row.sync_version or 0) + 1
    db.flush()


def ts_fallback() -> int:
    return now_ms()
