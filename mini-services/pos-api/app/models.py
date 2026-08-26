"""SQLAlchemy ORM models.

All mutable tables include sync-metadata columns:
- updated_at BIGINT      epoch ms (set on every insert/update)
- deleted_at BIGINT NULL epoch ms (soft delete marker; NULL = active)
- sync_version BIGINT DEFAULT 0  (monotonic per-row version, incremented on each update)

Types chosen to be PostgreSQL-compatible so switching the storage backend is a
one-line DATABASE_URL change (no model edits required).

Note on autoincrement: SQLite only treats the literal `INTEGER PRIMARY KEY`
as an autoincrementing rowid alias. `BIGINT PRIMARY KEY` does NOT autoincrement
on NULL. To support both SQLite (dev) and PostgreSQL (prod) we use
`BigInteger().with_variant(Integer(), "sqlite")` for primary keys, which emits
`INTEGER PRIMARY KEY` on SQLite (autoincrement works) and `BIGINT PRIMARY KEY`
on PostgreSQL (sequence-backed, works).
"""
from datetime import timezone  # noqa: F401  (kept for future timestamp helpers)

from sqlalchemy import (
    BigInteger,
    Column,
    Float,
    Integer,
    Text,
)

from .db import Base


# Primary key column type that autoincrements on both SQLite and PostgreSQL.
PK_TYPE = BigInteger().with_variant(Integer(), "sqlite")


class StoreInfo(Base):
    __tablename__ = "store_info"

    key = Column(Text, primary_key=True)
    value = Column(Text, nullable=True)

    # sync metadata
    updated_at = Column(BigInteger, nullable=False, default=0)
    deleted_at = Column(BigInteger, nullable=True)
    sync_version = Column(BigInteger, nullable=False, default=0)


class Category(Base):
    __tablename__ = "categories"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=True)
    color = Column(Text, nullable=True)
    emoji = Column(Text, nullable=True)
    position = Column(Integer, nullable=False, default=0)

    updated_at = Column(BigInteger, nullable=False, default=0)
    deleted_at = Column(BigInteger, nullable=True)
    sync_version = Column(BigInteger, nullable=False, default=0)


class Product(Base):
    __tablename__ = "products"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    name = Column(Text, nullable=True)
    category_id = Column(BigInteger, nullable=True)
    price = Column(Float, nullable=True)
    quantity_type = Column(Text, nullable=True)
    is_custom = Column(Integer, nullable=False, default=0)

    updated_at = Column(BigInteger, nullable=False, default=0)
    deleted_at = Column(BigInteger, nullable=True)
    sync_version = Column(BigInteger, nullable=False, default=0)


class Order(Base):
    __tablename__ = "orders"

    id = Column(PK_TYPE, primary_key=True, autoincrement=True)
    timestamp = Column(BigInteger, nullable=True)
    total = Column(Float, nullable=True)
    status = Column(Text, nullable=True)
    items_json = Column(Text, nullable=True)

    updated_at = Column(BigInteger, nullable=False, default=0)
    deleted_at = Column(BigInteger, nullable=True)
    sync_version = Column(BigInteger, nullable=False, default=0)
