import { NextRequest, NextResponse } from "next/server";
import { sbSelectAll, sbInsert, nowMs, BUSINESS_SHIFT_MS } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const month = searchParams.get("month") || undefined;
    const date = searchParams.get("date") || undefined;
    const limit = Number(searchParams.get("limit") || 5000);
    const search = searchParams.get("search") || undefined;

    const rows = await sbSelectAll("orders", { order: "timestamp:desc", limit: Math.min(limit, 10000) });
    const result: any[] = [];
    for (const r of rows) {
      if (r.deleted_at != null) continue;
      if (status && r.status !== status) continue;
      const ts = r.timestamp ?? 0;
      const shifted = ts - BUSINESS_SHIFT_MS;
      const d = new Date(shifted);
      if (month && formatMonth(d) !== month) continue;
      if (date && formatDate(d) !== date) continue;
      if (search) {
        const orderIdStr = `ORD-${String(r.id).padStart(3, "0")}`;
        if (!orderIdStr.toLowerCase().includes(search.toLowerCase())) continue;
      }
      let items: unknown[] = [];
      try {
        items = r.items_json ? JSON.parse(r.items_json) : [];
      } catch {}
      result.push({
        id: r.id,
        timestamp: ts,
        total: r.total ?? 0,
        status: r.status,
        items,
        id_str: `ORD-${String(r.id).padStart(3, "0")}`,
      });
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const o = await req.json();
    const t = nowMs();
    const ts = o.timestamp ?? t;
    const row = {
      timestamp: ts,
      total: o.total,
      status: o.status ?? "completed",
      items_json: JSON.stringify(o.items ?? []),
      updated_at: t,
      sync_version: 1,
      deleted_at: null,
    };
    const inserted = await sbInsert("orders", row);
    return NextResponse.json(inserted);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

function formatMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
