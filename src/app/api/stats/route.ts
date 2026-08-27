import { NextRequest, NextResponse } from "next/server";
import { sbSelectAll, BUSINESS_SHIFT_MS } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const month = searchParams.get("month") || undefined;
    const date = searchParams.get("date") || undefined;

    const rows = await sbSelectAll("orders", { limit: 10000 });
    let revenue = 0;
    let orderCount = 0;
    let returnedCount = 0;
    let returnedValue = 0;

    for (const r of rows) {
      if (r.deleted_at != null) continue;
      const ts = r.timestamp ?? 0;
      const d = new Date(ts - BUSINESS_SHIFT_MS);
      // Format in Asia/Karachi timezone (the restaurant's timezone)
      const monthStr = d.toLocaleString("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit" });
      const dateStr = d.toLocaleString("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" });
      const rStatus = r.status;
      const rTotal = r.total ?? 0;

      if (!status || rStatus === status) {
        if (month && monthStr !== month) { /* skip */ }
        else if (date && dateStr !== date) { /* skip */ }
        else {
          revenue += rTotal;
          orderCount++;
        }
      }
      if (rStatus === "returned") {
        if (month && monthStr !== month) continue;
        if (date && dateStr !== date) continue;
        returnedCount++;
        returnedValue += rTotal;
      }
    }

    return NextResponse.json({
      revenue,
      orders: orderCount,
      returnedCount,
      returnedValue,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
