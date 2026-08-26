import { NextRequest, NextResponse } from "next/server";
import { sbSelectAll, sbUpsert, nowMs } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await sbSelectAll("store_info");
    const result: Record<string, unknown> = {};
    for (const r of rows) {
      if (r.deleted_at == null) {
        try {
          result[r.key] = r.value ? JSON.parse(r.value) : null;
        } catch {
          result[r.key] = r.value;
        }
      }
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const payload = await req.json();
    const t = nowMs();
    for (const [key, value] of Object.entries(payload)) {
      await sbUpsert(
        "store_info",
        { key, value: JSON.stringify(value), updated_at: t, sync_version: 1, deleted_at: null },
        "key"
      );
    }
    // Return updated store-info
    const rows = await sbSelectAll("store_info");
    const result: Record<string, unknown> = {};
    for (const r of rows) {
      if (r.deleted_at == null) {
        try {
          result[r.key] = r.value ? JSON.parse(r.value) : null;
        } catch {
          result[r.key] = r.value;
        }
      }
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
