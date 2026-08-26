// src/lib/supabase-server.ts
// Server-side Supabase client for Next.js API routes.
// Uses the service role key for full DB access (server-only, never exposed to client).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

// Cache the client across hot-reloads in dev
let _client: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("Supabase credentials not set. Set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) in Vercel env vars.");
  }
  _client = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export const BUSINESS_SHIFT_MS = 9 * 60 * 60 * 1000;
export const nowMs = () => Date.now();

// ---------- Helpers (mirror the Python backend's supabase_client.py) ----------

export async function sbSelectAll(table: string, opts?: { filters?: Record<string, unknown>; order?: string; limit?: number }) {
  const sb = getSupabase();
  let q = sb.from(table).select("*");
  if (opts?.filters) {
    for (const [col, val] of Object.entries(opts.filters)) {
      if (val !== undefined && val !== null) q = q.eq(col, val);
    }
  }
  if (opts?.order) {
    const [col, dir] = opts.order.split(":");
    q = q.order(col, { ascending: dir !== "desc" });
  }
  q = q.limit(opts?.limit ?? 5000);
  const r = await q;
  return r.data ?? [];
}

export async function sbSelectById(table: string, idCol: string, idVal: unknown) {
  const sb = getSupabase();
  const r = await sb.from(table).select("*").eq(idCol, idVal).limit(1);
  return r.data?.[0] ?? null;
}

export async function sbInsert(table: string, row: Record<string, unknown>) {
  const sb = getSupabase();
  const r = await sb.from(table).insert(row);
  return r.data?.[0] ?? null;
}

export async function sbUpsert(table: string, rows: Record<string, unknown> | Record<string, unknown>[], onConflict?: string) {
  const sb = getSupabase();
  const r = await sb.from(table).upsert(rows as any, onConflict ? { onConflict } : undefined);
  return r.data ?? [];
}

export async function sbUpdate(table: string, idCol: string, idVal: unknown, updates: Record<string, unknown>) {
  const sb = getSupabase();
  const r = await sb.from(table).update(updates).eq(idCol, idVal);
  return r.data?.[0] ?? null;
}

export async function sbSoftDelete(table: string, idCol: string, idVal: unknown, updatedAt: number) {
  return sbUpdate(table, idCol, idVal, { deleted_at: updatedAt, updated_at: updatedAt });
}

export async function sbCount(table: string) {
  const sb = getSupabase();
  const r = await sb.from(table).select("*", { count: "exact", head: true });
  return r.count ?? 0;
}
