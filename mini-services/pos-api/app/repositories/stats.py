"""Stats + Summary repository (computations using 9-hour business-day shift)."""
import json
from collections import defaultdict
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Category, Order, Product

NINE_HOURS_MS = 9 * 3600 * 1000


def _shifted_day_expr():
    """SQL expression: business-day date string 'YYYY-MM-DD' using -9h shift."""
    return func.strftime("%Y-%m-%d", func.datetime((Order.timestamp - NINE_HOURS_MS) / 1000, "unixepoch"))


def _shifted_month_expr():
    return func.strftime("%Y-%m", func.datetime((Order.timestamp - NINE_HOURS_MS) / 1000, "unixepoch"))


def summary_by_date(db: Session, *, month: str | None = None, scope: str = "month",
                    year: str | None = None) -> list[dict]:
    """scope=month → daily labels within month YYYY-MM; scope=year → monthly labels within year YYYY.

    Returns [{label, revenue, orders}] aggregated over non-deleted, status='completed' orders.
    """
    stmt = select(
        _shifted_day_expr().label("day") if scope == "month" else _shifted_month_expr().label("month"),
        func.coalesce(func.sum(Order.total), 0.0).label("revenue"),
        func.count(Order.id).label("orders"),
    ).where(Order.deleted_at.is_(None), Order.status == "completed")

    if scope == "month" and month:
        stmt = stmt.where(_shifted_month_expr() == month).group_by("day").order_by("day")
    elif scope == "year" and year:
        stmt = stmt.where(func.strftime("%Y", func.datetime((Order.timestamp - NINE_HOURS_MS) / 1000, "unixepoch")) == year) \
            .group_by("month").order_by("month")
    else:
        return []

    rows = db.execute(stmt).all()
    out = []
    for r in rows:
        label = r[0]
        out.append({
            "label": label,
            "revenue": float(r[1] or 0.0),
            "orders": int(r[2] or 0),
        })
    return out


def summary_by_category(db: Session, *, month: str | None = None) -> dict:
    """Group order items by category, plus top-10 products.

    items_json format: list of {id, name, categoryId, price, quantityType, isCustom, quantity, total}.

    Filter: skip "Uncategorized" (categoryId is None/unknown or category name == 'Uncategorized').
    Sort desc by value. Products: top 10 by total.
    """
    # Load categories for id->name lookup (non-deleted).
    cats = {c.id: c.name for c in db.execute(select(Category).where(Category.deleted_at.is_(None))).scalars().all()}
    # Also product id -> categoryId fallback.
    products = {p.id: p for p in db.execute(select(Product)).scalars().all()}

    # Build query for orders.
    stmt = select(Order).where(Order.deleted_at.is_(None), Order.status == "completed")
    if month:
        stmt = stmt.where(_shifted_month_expr() == month)
    orders = db.execute(stmt).scalars().all()

    cat_totals: dict[str, float] = defaultdict(float)
    prod_totals: dict[str, float] = defaultdict(float)

    for o in orders:
        try:
            items = json.loads(o.items_json) if o.items_json else []
        except (ValueError, TypeError):
            continue
        for it in items:
            try:
                total_val = float(it.get("total") or 0)
            except (ValueError, TypeError):
                total_val = 0.0
            if total_val <= 0:
                continue

            # Resolve category id from item, fallback to product lookup.
            cid = it.get("categoryId")
            if cid is None and it.get("id") and not str(it.get("id", "")).startswith("custom_"):
                prod = products.get(int(it.get("id")))
                if prod:
                    cid = prod.category_id

            cat_name = None
            if cid is not None and cid in cats:
                cat_name = cats[cid]

            if cat_name is None or cat_name == "Uncategorized":
                continue

            cat_totals[cat_name] += total_val
            prod_name = it.get("name") or "Unknown"
            prod_totals[prod_name] += total_val

    cat_list = sorted(
        [{"name": k, "value": round(v, 2)} for k, v in cat_totals.items()],
        key=lambda x: x["value"],
        reverse=True,
    )
    prod_list = sorted(
        [{"name": k, "value": round(v, 2)} for k, v in prod_totals.items()],
        key=lambda x: x["value"],
        reverse=True,
    )[:10]

    return {"categories": cat_list, "products": prod_list}
