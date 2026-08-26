"""Pydantic schemas (input/output)."""
from typing import Any, Optional

from pydantic import BaseModel, Field


# ---- Store Info ----
class StoreInfoUpsert(BaseModel):
    # arbitrary keys -> values (dict)
    class Config:
        extra = "allow"


# ---- Categories ----
class CategoryCreate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    emoji: Optional[str] = None


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    emoji: Optional[str] = None


class CategoryOut(BaseModel):
    id: int
    name: Optional[str] = None
    color: Optional[str] = None
    emoji: Optional[str] = None
    position: int = 0


class CategoryOrder(BaseModel):
    idOrderMap: dict[str, int] = Field(default_factory=dict)


# ---- Products ----
class ProductCreate(BaseModel):
    name: Optional[str] = None
    categoryId: Optional[int] = None
    price: Optional[float] = None
    quantityType: Optional[str] = None
    isCustom: Optional[int] = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    categoryId: Optional[int] = None
    price: Optional[float] = None
    quantityType: Optional[str] = None
    isCustom: Optional[int] = 0


class ProductOut(BaseModel):
    id: int
    name: Optional[str] = None
    categoryId: Optional[int] = None
    price: Optional[float] = None
    quantityType: Optional[str] = None
    isCustom: int = 0


# ---- Orders ----
class OrderItem(BaseModel):
    # free-form cart items; no strict schema (mirrors original)
    class Config:
        extra = "allow"


class OrderCreate(BaseModel):
    timestamp: int
    total: float
    status: str
    items: list[Any] = Field(default_factory=list)


class OrderStatusUpdate(BaseModel):
    status: str


class OrderOut(BaseModel):
    id: int
    timestamp: Optional[int] = None
    total: Optional[float] = None
    status: Optional[str] = None
    items_json: Optional[Any] = None  # parsed array


# ---- Stats / Summary ----
class StatsOut(BaseModel):
    revenue: float = 0.0
    orders: int = 0
    returnedCount: int = 0
    returnedValue: float = 0.0


# ---- Sync ----
class SyncPush(BaseModel):
    changes: dict[str, list[dict]] = Field(default_factory=dict)
    device_id: Optional[str] = None


class SyncPull(BaseModel):
    since: int = 0
