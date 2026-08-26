import { NextRequest, NextResponse } from "next/server";
import { sbSelectAll, sbInsert, sbSoftDelete, sbUpdate, sbUpsert, nowMs } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await sbSelectAll("categories", { order: "position:asc" });
    return NextResponse.json(rows.filter((r: any) => r.deleted_at == null));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cat = await req.json();
    const t = nowMs();
    const row = {
      name: cat.name,
      color: cat.color ?? "#EF4444",
      emoji: cat.emoji ?? "🍛",
      position: 0,
      updated_at: t,
      sync_version: 1,
      deleted_at: null,
    };
    const inserted = await sbInsert("categories", row);
    return NextResponse.json(inserted);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  // Bulk reorder: { idOrderMap: { "10": 0, "15": 1, ... } }
  try {
    const { idOrderMap } = await req.json();
    const t = nowMs();
    for (const [id, pos] of Object.entries(idOrderMap)) {
      await sbUpdate("categories", "id", Number(id), { position: pos as number, updated_at: t });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
