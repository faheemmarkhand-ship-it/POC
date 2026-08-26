import { NextRequest, NextResponse } from "next/server";
import { sbSelectById, sbUpdate, sbSoftDelete, nowMs } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const prodId = Number(id);
    const p = await req.json();
    const t = nowMs();
    const existing = await sbSelectById("products", "id", prodId);
    const updates: Record<string, unknown> = { updated_at: t };
    if (p.name !== undefined) updates.name = p.name;
    if (p.categoryId !== undefined) updates.category_id = p.categoryId;
    if (p.price !== undefined) updates.price = p.price;
    if (p.quantityType !== undefined) updates.quantity_type = p.quantityType;
    if (p.isCustom !== undefined) updates.is_custom = p.isCustom ? 1 : 0;
    updates.sync_version = (existing?.sync_version ?? 0) + 1;
    const updated = await sbUpdate("products", "id", prodId, updates);
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const prodId = Number(id);
    const t = nowMs();
    await sbSoftDelete("products", "id", prodId, t);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
