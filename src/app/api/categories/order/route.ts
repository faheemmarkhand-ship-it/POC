import { NextRequest, NextResponse } from "next/server";
import { sbUpdate, nowMs } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
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
