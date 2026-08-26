"""All API routers, mounted under /api."""
import json
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Category, Order, Product, StoreInfo
from ..repositories import categories as cat_repo
from ..repositories import orders as order_repo
from ..repositories import products as prod_repo
from ..repositories import store_info as si_repo
from ..repositories import sync as sync_repo
from ..schemas import (
    CategoryCreate,
    CategoryOrder,
    CategoryUpdate,
    OrderCreate,
    OrderStatusUpdate,
    ProductCreate,
    ProductUpdate,
    SyncPush,
)
from ..services import stats as stats_svc

router = APIRouter(prefix="/api")


# ---------------- Health ----------------
@router.get("/health")
def health(db: Session = Depends(get_db)):
    counts = {
        "store_info": db.execute(select(func.count(StoreInfo.key))).scalar_one(),
        "categories": db.execute(select(func.count(Category.id))).scalar_one(),
        "products": db.execute(select(func.count(Product.id))).scalar_one(),
        "orders": db.execute(select(func.count(Order.id))).scalar_one(),
    }
    return {"status": "ok", "db": "connected", "counts": counts}


# ---------------- Store Info ----------------
@router.get("/store-info")
def get_store_info(db: Session = Depends(get_db)):
    return si_repo.get_all(db)


@router.put("/store-info")
def put_store_info(payload: dict[str, Any], db: Session = Depends(get_db)):
    return si_repo.upsert_many(db, payload)


# ---------------- Categories ----------------
@router.get("/categories")
def list_categories(db: Session = Depends(get_db)):
    rows = cat_repo.list_active(db)
    return [
        {
            "id": r.id, "name": r.name, "color": r.color,
            "emoji": r.emoji, "position": r.position,
        }
        for r in rows
    ]


@router.post("/categories")
def create_category(body: CategoryCreate, db: Session = Depends(get_db)):
    row = cat_repo.create(db, body.name, body.color, body.emoji)
    return {
        "id": row.id, "name": row.name, "color": row.color,
        "emoji": row.emoji, "position": row.position,
    }


@router.put("/categories/order")
def reorder_categories(body: CategoryOrder, db: Session = Depends(get_db)):
    cat_repo.reorder(db, body.idOrderMap)
    return {"ok": True}


@router.put("/categories/{cid}")
def update_category(cid: int, body: CategoryUpdate, db: Session = Depends(get_db)):
    row = cat_repo.update(db, cid, body.name, body.color, body.emoji)
    if row is None:
        raise HTTPException(status_code=404, detail="Category not found")
    return {
        "id": row.id, "name": row.name, "color": row.color,
        "emoji": row.emoji, "position": row.position,
    }


@router.delete("/categories/{cid}")
def delete_category(cid: int, db: Session = Depends(get_db)):
    ok, err, prod_count = cat_repo.soft_delete(db, cid)
    if not ok:
        # Distinguish 404 vs 409 by message.
        if err and "not found" in err.lower():
            raise HTTPException(status_code=404, detail=err)
        raise HTTPException(status_code=409, detail=err)
    return {"ok": True, "id": cid}


# ---------------- Products ----------------
@router.get("/products")
def list_products(db: Session = Depends(get_db)):
    rows = prod_repo.list_active(db)
    return [
        {
            "id": r.id, "name": r.name, "categoryId": r.category_id,
            "price": r.price, "quantityType": r.quantity_type,
            "isCustom": r.is_custom,
        }
        for r in rows
    ]


@router.post("/products")
def create_product(body: ProductCreate, db: Session = Depends(get_db)):
    row = prod_repo.create(
        db, body.name, body.categoryId, body.price,
        body.quantityType, body.isCustom or 0,
    )
    return {
        "id": row.id, "name": row.name, "categoryId": row.category_id,
        "price": row.price, "quantityType": row.quantity_type,
        "isCustom": row.is_custom,
    }


@router.put("/products/{pid}")
def update_product(pid: int, body: ProductUpdate, db: Session = Depends(get_db)):
    row = prod_repo.update(
        db, pid, body.name, body.categoryId, body.price,
        body.quantityType, body.isCustom or 0,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return {
        "id": row.id, "name": row.name, "categoryId": row.category_id,
        "price": row.price, "quantityType": row.quantity_type,
        "isCustom": row.is_custom,
    }


@router.delete("/products/{pid}")
def delete_product(pid: int, db: Session = Depends(get_db)):
    ok = prod_repo.soft_delete(db, pid)
    if not ok:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"ok": True, "id": pid}


# ---------------- Orders ----------------
@router.get("/orders")
def list_orders(
    status: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    limit: int = Query(order_repo.DEFAULT_LIMIT),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return order_repo.list_orders(
        db, status=status, month=month, date=date, limit=limit, search=search,
    )


@router.post("/orders")
def create_order(body: OrderCreate, db: Session = Depends(get_db)):
    return order_repo.create(
        db, timestamp=body.timestamp, total=body.total,
        status=body.status, items=body.items,
    )


@router.put("/orders/{oid}/status")
def update_order_status(oid: int, body: OrderStatusUpdate, db: Session = Depends(get_db)):
    row = order_repo.update_status(db, oid, body.status)
    if row is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return row


@router.delete("/orders/{oid}")
def delete_order(oid: int, db: Session = Depends(get_db)):
    ok = order_repo.hard_delete(db, oid)
    if not ok:
        raise HTTPException(status_code=404, detail="Order not found")
    return {"ok": True, "id": oid}


@router.delete("/orders")
def clear_orders(db: Session = Depends(get_db)):
    order_repo.clear_all(db)
    return {"ok": True, "cleared": True}


# ---------------- Stats ----------------
@router.get("/stats")
def get_stats(
    status: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return stats_svc.get_stats(db, status=status, month=month, date=date)


@router.get("/summary/date")
def summary_date(
    month: Optional[str] = Query(None),
    scope: str = Query("month"),
    year: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return stats_svc.get_summary_date(db, month=month, scope=scope, year=year)


@router.get("/summary/category")
def summary_category(
    month: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    return stats_svc.get_summary_category(db, month=month)


# ---------------- Sync ----------------
@router.post("/sync/push")
def sync_push(body: SyncPush, db: Session = Depends(get_db)):
    payload = {"changes": body.changes, "device_id": body.device_id}
    return sync_repo.push(db, payload)


@router.get("/sync/pull")
def sync_pull(since: int = Query(0), db: Session = Depends(get_db)):
    return sync_repo.pull(db, since)
