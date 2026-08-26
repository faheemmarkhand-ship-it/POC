import { NextResponse } from "next/server";
import { getSupabase, sbSelectAll, BUSINESS_SHIFT_MS } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const sb = getSupabase();
    await sb.from("orders").delete().neq("id", -1);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
