"""FastAPI backend using Supabase (PostgREST) as the online database.

This version uses the Supabase REST API with the anon/publishable key —
no database password needed. The schema must be created once via the
Supabase dashboard SQL Editor (see supabase_schema.sql).

The anon key can read/write data (RLS policies allow it) but cannot
create tables (DDL).
"""
import json
import time
import logging
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import supabase_client as sb

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("pos_supabase")

app = FastAPI(title="POS API (Supabase)", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

BUSINESS_SHIFT_MS = 9 * 60 * 60 * 1000  # 9-hour business-day shift
now_ms = lambda: int(time.time() * 1000)


# ---------- Pydantic schemas ----------
class CategoryIn(BaseModel):
    name: str
    color: str = "#EF4444"
    emoji: str = "🍛"

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    emoji: Optional[str] = None

class CategoryOrder(BaseModel):
    idOrderMap: dict[str, int]

class ProductIn(BaseModel):
    name: str
    categoryId: int
    price: float
    quantityType: str = "pcs"
    isCustom: bool = False

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    categoryId: Optional[int] = None
    price: Optional[float] = None
    quantityType: Optional[str] = None
    isCustom: Optional[bool] = None

class OrderIn(BaseModel):
    timestamp: Optional[int] = None
    total: float
    status: str = "completed"
    items: list[dict] = []

class OrderStatusUpdate(BaseModel):
    status: str

class SyncChange(BaseModel):
    id: Any
    operation: str
    record: dict | None = None

class SyncPush(BaseModel):
    changes: dict[str, list[SyncChange]]
    device_id: str = "web"


# ---------- Health ----------
@app.get("/api/health")
def health():
    try:
        counts = {
            "store_info": sb.count("store_info"),
            "categories": sb.count("categories"),
            "products": sb.count("products"),
            "orders": sb.count("orders"),
        }
        return {"status": "ok", "db": "supabase", "counts": counts}
    except Exception as e:
        return {"status": "error", "db": "supabase", "error": str(e)}


# ---------- Store Info ----------
@app.get("/api/store-info")
def get_store_info():
    rows = sb.select_all("store_info")
    result = {}
    for r in rows:
        if r.get("deleted_at") is None:
            try:
                result[r["key"]] = json.loads(r["value"]) if r.get("value") else None
            except (json.JSONDecodeError, TypeError):
                result[r["key"]] = r.get("value")
    return result


@app.put("/api/store-info")
def put_store_info(payload: dict):
    t = now_ms()
    for key, value in payload.items():
        sb.upsert("store_info", {
            "key": key,
            "value": json.dumps(value),
            "updated_at": t,
            "sync_version": 1,
            "deleted_at": None,
        }, on_conflict="key")
    return get_store_info()


# ---------- Categories ----------
@app.get("/api/categories")
def list_categories():
    rows = sb.select_all("categories", order="position:asc")
    return [r for r in rows if r.get("deleted_at") is None]


@app.post("/api/categories")
def create_category(cat: CategoryIn):
    t = now_ms()
    row = {
        "name": cat.name, "color": cat.color, "emoji": cat.emoji,
        "position": 0, "updated_at": t, "sync_version": 1, "deleted_at": None,
    }
    return sb.insert("categories", row)


@app.put("/api/categories/{cat_id}")
def update_category(cat_id: int, cat: CategoryUpdate):
    t = now_ms()
    updates = {k: v for k, v in cat.dict().items() if v is not None}
    updates["updated_at"] = t
    # bump sync_version manually
    existing = sb.select_by_id("categories", "id", cat_id)
    if existing:
        updates["sync_version"] = (existing.get("sync_version") or 0) + 1
    return sb.update("categories", "id", cat_id, updates)


@app.delete("/api/categories/{cat_id}")
def delete_category(cat_id: int):
    # Check if category has non-deleted products
    prods = sb.select_all("products", filters={"category_id": cat_id})
    active_prods = [p for p in prods if p.get("deleted_at") is None]
    if active_prods:
        raise HTTPException(409, "Cannot delete category: It still contains products")
    t = now_ms()
    sb.soft_delete("categories", "id", cat_id, t)
    return {"ok": True}


@app.put("/api/categories/order")
def reorder_categories(payload: CategoryOrder):
    t = now_ms()
    for id_str, pos in payload.idOrderMap.items():
        sb.update("categories", "id", int(id_str), {"position": pos, "updated_at": t})
    return {"ok": True}


# ---------- Products ----------
@app.get("/api/products")
def list_products():
    rows = sb.select_all("products", order="id:asc")
    return [r for r in rows if r.get("deleted_at") is None]


@app.post("/api/products")
def create_product(p: ProductIn):
    t = now_ms()
    row = {
        "name": p.name, "category_id": p.categoryId, "price": p.price,
        "quantity_type": p.quantityType, "is_custom": 1 if p.isCustom else 0,
        "updated_at": t, "sync_version": 1, "deleted_at": None,
    }
    return sb.insert("products", row)


@app.put("/api/products/{prod_id}")
def update_product(prod_id: int, p: ProductUpdate):
    t = now_ms()
    updates = {}
    if p.name is not None: updates["name"] = p.name
    if p.categoryId is not None: updates["category_id"] = p.categoryId
    if p.price is not None: updates["price"] = p.price
    if p.quantityType is not None: updates["quantity_type"] = p.quantityType
    if p.isCustom is not None: updates["is_custom"] = 1 if p.isCustom else 0
    updates["updated_at"] = t
    existing = sb.select_by_id("products", "id", prod_id)
    if existing:
        updates["sync_version"] = (existing.get("sync_version") or 0) + 1
    return sb.update("products", "id", prod_id, updates)


@app.delete("/api/products/{prod_id}")
def delete_product(prod_id: int):
    t = now_ms()
    sb.soft_delete("products", "id", prod_id, t)
    return {"ok": True}


# ---------- Orders ----------
@app.get("/api/orders")
def list_orders(
    status: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    limit: int = Query(5000, le=10000),
    search: Optional[str] = Query(None),
):
    # Fetch all non-deleted orders, then filter in Python (PostgREST can't do the 9h shift easily)
    rows = sb.select_all("orders", order="timestamp:desc", limit=limit)
    result = []
    for r in rows:
        if r.get("deleted_at") is not None:
            continue
        if status and r.get("status") != status:
            continue
        ts = r.get("timestamp") or 0
        shifted = ts - BUSINESS_SHIFT_MS
        if month:
            # month format YYYY-MM
            import datetime
            d = datetime.datetime.fromtimestamp(shifted / 1000)
            if d.strftime("%Y-%m") != month:
                continue
        if date:
            import datetime
            d = datetime.datetime.fromtimestamp(shifted / 1000)
            if d.strftime("%Y-%m-%d") != date:
                continue
        if search:
            order_id_str = f"ORD-{r['id']:03d}"
            if search.lower() not in order_id_str.lower():
                continue
        # Parse items_json
        items = []
        try:
            items = json.loads(r.get("items_json") or "[]")
        except (json.JSONDecodeError, TypeError):
            pass
        result.append({
            "id": r["id"], "timestamp": ts, "total": r.get("total") or 0,
            "status": r.get("status"), "items": items,
            "id_str": f"ORD-{r['id']:03d}",
        })
    return result


@app.post("/api/orders")
def create_order(o: OrderIn):
    t = now_ms()
    ts = o.timestamp or t
    row = {
        "timestamp": ts, "total": o.total, "status": o.status,
        "items_json": json.dumps(o.items),
        "updated_at": t, "sync_version": 1, "deleted_at": None,
    }
    inserted = sb.insert("orders", row)
    return inserted


@app.put("/api/orders/{order_id}/status")
def update_order_status(order_id: int, payload: OrderStatusUpdate):
    t = now_ms()
    existing = sb.select_by_id("orders", "id", order_id)
    updates = {
        "status": payload.status, "updated_at": t,
        "sync_version": (existing.get("sync_version") or 0) + 1 if existing else 1,
    }
    return sb.update("orders", "id", order_id, updates)


@app.delete("/api/orders/{order_id}")
def delete_order(order_id: int):
    sb.delete_hard("orders", "id", order_id)
    return {"ok": True}


@app.delete("/api/orders")
def clear_all_orders():
    # Hard delete all (matches original behavior)
    client = sb.get_client()
    client.table("orders").delete().neq("id", -1).execute()
    return {"ok": True}


# ---------- Stats ----------
@app.get("/api/stats")
def get_stats(
    status: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
):
    rows = sb.select_all("orders", limit=10000)
    import datetime
    revenue = 0.0
    order_count = 0
    returned_count = 0
    returned_value = 0.0
    for r in rows:
        if r.get("deleted_at") is not None:
            continue
        ts = r.get("timestamp") or 0
        shifted = ts - BUSINESS_SHIFT_MS
        d = datetime.datetime.fromtimestamp(shifted / 1000)
        r_status = r.get("status")
        r_total = r.get("total") or 0
        # Main stats
        if (not status or r_status == status):
            if month and d.strftime("%Y-%m") != month:
                pass
            elif date and d.strftime("%Y-%m-%d") != date:
                pass
            else:
                revenue += r_total
                order_count += 1
        # Returned stats (always status='returned', filtered by month/date)
        if r_status == "returned":
            if month and d.strftime("%Y-%m") != month:
                continue
            if date and d.strftime("%Y-%m-%d") != date:
                continue
            returned_count += 1
            returned_value += r_total
    return {
        "revenue": revenue, "orders": order_count,
        "returnedCount": returned_count, "returnedValue": returned_value,
    }


# ---------- Summary ----------
@app.get("/api/summary/date")
def summary_by_date(
    month: Optional[str] = Query(None),
    scope: str = Query("month"),
    year: Optional[str] = Query(None),
):
    rows = sb.select_all("orders", limit=10000)
    import datetime
    buckets = {}
    for r in rows:
        if r.get("deleted_at") is not None or r.get("status") != "completed":
            continue
        ts = r.get("timestamp") or 0
        shifted = ts - BUSINESS_SHIFT_MS
        d = datetime.datetime.fromtimestamp(shifted / 1000)
        if scope == "month":
            if month and d.strftime("%Y-%m") != month:
                continue
            label = d.strftime("%Y-%m-%d")
        else:
            if year and d.strftime("%Y") != year:
                continue
            label = d.strftime("%Y-%m")
        buckets[label] = {
            "label": label,
            "revenue": buckets.get(label, {}).get("revenue", 0) + (r.get("total") or 0),
            "orders": buckets.get(label, {}).get("orders", 0) + 1,
        }
    return sorted(buckets.values(), key=lambda x: x["label"])


@app.get("/api/summary/category")
def summary_by_category(month: Optional[str] = Query(None)):
    rows = sb.select_all("orders", limit=10000)
    products = sb.select_all("products")
    categories = sb.select_all("categories")
    prod_to_cat = {}
    for p in products:
        for c in categories:
            if c["id"] == p.get("category_id"):
                prod_to_cat[p["name"]] = c["name"]
    import datetime
    cat_map = {}
    prod_map = {}
    for r in rows:
        if r.get("deleted_at") is not None or r.get("status") != "completed":
            continue
        if month:
            ts = r.get("timestamp") or 0
            d = datetime.datetime.fromtimestamp((ts - BUSINESS_SHIFT_MS) / 1000)
            if d.strftime("%Y-%m") != month:
                continue
        try:
            items = json.loads(r.get("items_json") or "[]")
        except (json.JSONDecodeError, TypeError):
            items = []
        for item in items:
            name = item.get("name", "Unknown")
            cat = item.get("category") or prod_to_cat.get(name, "Uncategorized")
            val = float(item.get("total", 0))
            cat_map[cat] = cat_map.get(cat, 0) + val
            prod_map[name] = prod_map.get(name, 0) + val
    cats = [{"name": k, "value": v} for k, v in cat_map.items() if v > 0 and k != "Uncategorized"]
    cats.sort(key=lambda x: -x["value"])
    prods = [{"name": k, "value": v} for k, v in prod_map.items() if v > 0]
    prods.sort(key=lambda x: -x["value"])
    return {"categories": cats, "products": prods[:10]}


# ---------- Sync ----------
@app.post("/api/sync/push")
def sync_push(payload: SyncPush):
    t = now_ms()
    applied = {"categories": 0, "products": 0, "orders": 0, "store_info": 0}
    conflicts = []
    for entity_type, changes in payload.changes.items():
        table_map = {
            "categories": ("categories", "id"),
            "products": ("products", "id"),
            "orders": ("orders", "id"),
            "store_info": ("store_info", "key"),
        }
        if entity_type not in table_map:
            continue
        table_name, id_col = table_map[entity_type]
        for change in changes:
            try:
                record = change.record or {}
                if change.operation == "delete":
                    sb.soft_delete(table_name, id_col, change.id, t)
                    applied[entity_type] += 1
                else:
                    # Check for conflict: server record newer?
                    existing = sb.select_by_id(table_name, id_col, change.id)
                    # Normalize record: convert items (array) → items_json (string) for orders
                    record = dict(record)  # copy so we can mutate
                    if entity_type == "orders":
                        if "items" in record and "items_json" not in record:
                            record["items_json"] = json.dumps(record.pop("items"))
                        elif "items" in record:
                            record.pop("items")
                    if existing:
                        server_updated = existing.get("updated_at") or 0
                        client_updated = record.get("updated_at") or 0
                        if server_updated > client_updated:
                            conflicts.append({
                                "entity_type": entity_type,
                                "entity_id": change.id,
                                "server_record": existing,
                                "client_record": record,
                                "reason": "server record is newer",
                            })
                            continue
                        # Upsert with bumped sync_version
                        updates = record.copy()
                        updates["updated_at"] = t
                        updates["sync_version"] = (existing.get("sync_version") or 0) + 1
                        updates["deleted_at"] = None
                        sb.update(table_name, id_col, change.id, updates)
                    else:
                        # New record — insert
                        if id_col == "key":
                            inserts = record.copy()
                        else:
                            inserts = record.copy()
                            if "id" not in inserts:
                                inserts[id_col] = int(change.id) if str(change.id).isdigit() else change.id
                        inserts["updated_at"] = t
                        inserts["sync_version"] = 1
                        inserts["deleted_at"] = None
                        sb.insert(table_name, inserts)
                    applied[entity_type] += 1
            except Exception as e:
                log.error(f"sync push error ({entity_type} {change.id}): {e}")
    return {"applied": applied, "conflicts": conflicts, "server_time": t}


@app.get("/api/sync/pull")
def sync_pull(since: int = Query(0)):
    result = {"categories": [], "products": [], "orders": [], "store_info": [], "server_time": now_ms()}
    for entity, table_name in [("categories", "categories"), ("products", "products"), ("orders", "orders"), ("store_info", "store_info")]:
        rows = sb.select_all(table_name, limit=10000)
        result[entity] = [r for r in rows if (r.get("updated_at") or 0) > since]
    return result


@app.on_event("startup")
def _on_startup():
    log.info("POS Supabase backend starting...")
    log.info("Supabase URL: %s", sb.SUPABASE_URL)
    if sb.is_configured():
        try:
            h = health()
            log.info("Supabase health: %s", h)
        except Exception as e:
            log.warning("Supabase not ready yet: %s", e)
    else:
        log.warning("Supabase credentials not set!")
