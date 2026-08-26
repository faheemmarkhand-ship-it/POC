import { NextRequest, NextResponse } from "next/server";
import { sbSelectById, sbUpdate, sbSoftDelete, sbSelectAll, nowMs } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const catId = Number(id);
    const cat = await req.json();
    const t = nowMs();
    const existing = await sbSelectById("categories", "id", catId);
    const updates: Record<string, unknown> = { updated_at: t };
    if (cat.name !== undefined) updates.name = cat.name;
    if (cat.color !== undefined) updates.color = cat.color;
    if (cat.emoji !== undefined) updates.emoji = cat.emoji;
    updates.sync_version = (existing?.sync_version ?? 0) + 1;
    const updated = await sbUpdate("categories", "id", catId, updates);
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const catId = Number(id);
    // Check if category has non-deleted products
    const prods = await sbSelectAll("products", { filters: { category_id: catId } });
    const activeProds = prods.filter((p: any) => p.deleted_at == null);
    if (activeProds.length > 0) {
      return NextResponse.json(
        { detail: "Cannot delete category: It still contains products" },
        { status: 409 }
      );
    }
    const t = nowMs();
    await sbSoftDelete("categories", "id", catId, t);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
