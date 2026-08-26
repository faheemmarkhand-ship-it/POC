import { NextRequest, NextResponse } from "next/server";
import { sbSelectById, sbUpdate, nowMs } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orderId = Number(id);
    const { status } = await req.json();
    const t = nowMs();
    const existing = await sbSelectById("orders", "id", orderId);
    const updates = {
      status,
      updated_at: t,
      sync_version: (existing?.sync_version ?? 0) + 1,
    };
    const updated = await sbUpdate("orders", "id", orderId, updates);
    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
