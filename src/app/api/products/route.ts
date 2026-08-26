import { NextRequest, NextResponse } from "next/server";
import { sbSelectAll, sbInsert, nowMs } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await sbSelectAll("products", { order: "id:asc" });
    return NextResponse.json(rows.filter((r: any) => r.deleted_at == null));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const p = await req.json();
    const t = nowMs();
    const row = {
      name: p.name,
      category_id: p.categoryId,
      price: p.price,
      quantity_type: p.quantityType ?? "pcs",
      is_custom: p.isCustom ? 1 : 0,
      updated_at: t,
      sync_version: 1,
      deleted_at: null,
    };
    const inserted = await sbInsert("products", row);
    return NextResponse.json(inserted);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
