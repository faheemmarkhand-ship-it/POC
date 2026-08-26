import { NextRequest, NextResponse } from "next/server";
import { sbSelectAll, BUSINESS_SHIFT_MS } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || undefined;

    const rows = await sbSelectAll("orders", { limit: 10000 });
    const products = await sbSelectAll("products");
    const categories = await sbSelectAll("categories");
    const prodToCat: Record<string, string> = {};
    for (const p of products) {
      for (const c of categories) {
        if (c.id === p.category_id) prodToCat[p.name] = c.name;
      }
    }

    const catMap: Record<string, number> = {};
    const prodMap: Record<string, number> = {};

    for (const r of rows) {
      if (r.deleted_at != null || r.status !== "completed") continue;
      if (month) {
        const d = new Date((r.timestamp ?? 0) - BUSINESS_SHIFT_MS);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (monthStr !== month) continue;
      }
      let items: any[] = [];
      try {
        items = r.items_json ? JSON.parse(r.items_json) : [];
      } catch {}
      for (const item of items) {
        const name = item.name || "Unknown";
        const cat = item.category || prodToCat[name] || "Uncategorized";
        const val = Number(item.total) || 0;
        catMap[cat] = (catMap[cat] || 0) + val;
        prodMap[name] = (prodMap[name] || 0) + val;
      }
    }

    const cats = Object.entries(catMap)
      .map(([name, value]) => ({ name, value }))
      .filter((c) => c.value > 0 && c.name !== "Uncategorized")
      .sort((a, b) => b.value - a.value);
    const prods = Object.entries(prodMap)
      .map(([name, value]) => ({ name, value }))
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return NextResponse.json({ categories: cats, products: prods });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
