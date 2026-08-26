import { NextRequest, NextResponse } from "next/server";
import { sbSelectAll, nowMs } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const since = Number(searchParams.get("since") || 0);
    const serverTime = nowMs();

    const [categories, products, orders, store_info] = await Promise.all([
      sbSelectAll("categories", { limit: 10000 }),
      sbSelectAll("products", { limit: 10000 }),
      sbSelectAll("orders", { limit: 10000 }),
      sbSelectAll("store_info", { limit: 10000 }),
    ]);

    const filterSince = (rows: any[]) => rows.filter((r) => (r.updated_at ?? 0) > since);

    return NextResponse.json({
      categories: filterSince(categories),
      products: filterSince(products),
      orders: filterSince(orders),
      store_info: filterSince(store_info),
      server_time: serverTime,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
