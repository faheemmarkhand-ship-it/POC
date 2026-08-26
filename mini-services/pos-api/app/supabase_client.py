"""Supabase client for the POS backend.

Uses the Supabase REST API (PostgREST) with the anon/publishable key.
This is the recommended Supabase pattern — no direct PostgreSQL connection
needed, works with just the URL + publishable key.

The anon key can read/write data (with RLS policies allowing access) but
cannot create tables (DDL). The schema must be created once via the
Supabase dashboard SQL Editor — see supabase_schema.sql.
"""
import os
import json
from typing import Any, Optional
from functools import lru_cache

# Supabase credentials — set in .env or environment
SUPABASE_URL = os.environ.get(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://tiybeuglcubkndufyisp.supabase.co",
)
SUPABASE_KEY = os.environ.get(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_pqBNliqYZs1hTq-O4Cb4ow_wEZIABye",
)


@lru_cache(maxsize=1)
def get_client():
    """Return a cached Supabase client (singleton)."""
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def is_configured() -> bool:
    """Check if Supabase credentials are set."""
    return bool(SUPABASE_URL and SUPABASE_KEY)


def table(name: str):
    """Get a Supabase table query builder."""
    return get_client().table(name)


def upsert(table_name: str, rows: list[dict] | dict, on_conflict: Optional[str] = None):
    """Upsert one or many rows. Returns the response."""
    t = table(table_name)
    if on_conflict:
        t = t.upsert(rows, on_conflict=on_conflict)
    else:
        t = t.upsert(rows)
    return t.execute()


def select_all(table_name: str, filters: dict | None = None, order: str | None = None, limit: int = 5000):
    """Select all rows from a table with optional filters + ordering."""
    q = table(table_name).select("*")
    if filters:
        for col, val in filters.items():
            if val is not None:
                q = q.eq(col, val)
    if order:
        col, direction = order.split(":") if ":" in order else (order, "asc")
        q = q.order(col, desc=(direction == "desc"))
    q = q.limit(limit)
    r = q.execute()
    return r.data if r.data else []


def select_by_id(table_name: str, id_col: str, id_val):
    """Select a single row by id."""
    r = table(table_name).select("*").eq(id_col, id_val).limit(1).execute()
    return r.data[0] if r.data else None


def insert(table_name: str, row: dict):
    """Insert a row and return it."""
    r = table(table_name).insert(row).execute()
    return r.data[0] if r.data else None


def update(table_name: str, id_col: str, id_val, updates: dict):
    """Update a row by id and return it."""
    r = table(table_name).update(updates).eq(id_col, id_val).execute()
    return r.data[0] if r.data else None


def delete_hard(table_name: str, id_col: str, id_val):
    """Hard delete a row by id."""
    r = table(table_name).delete().eq(id_col, id_val).execute()
    return r.data if r.data else []


def soft_delete(table_name: str, id_col: str, id_val, updated_at: int):
    """Soft delete a row (set deleted_at)."""
    return update(table_name, id_col, id_val, {
        "deleted_at": updated_at,
        "updated_at": updated_at,
    })


def count(table_name: str):
    """Count rows in a table."""
    r = table(table_name).select("*", count="exact").limit(0).execute()
    return r.count if hasattr(r, "count") else 0
