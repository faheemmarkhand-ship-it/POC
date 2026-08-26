import { NextRequest, NextResponse } from "next/server";
import { sbSelectById, sbUpdate, sbSoftDelete, nowMs } from "@/lib/supabase-server";
import { getSupabase } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const orderId = Number(id);
    const sb = getSupabase();
    await sb.from("orders").delete().eq("id", orderId);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
