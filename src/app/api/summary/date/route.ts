import { NextRequest, NextResponse } from "next/server";
import { sbSelectAll, BUSINESS_SHIFT_MS } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") || undefined;
    const scope = searchParams.get("scope") || "month";
    const year = searchParams.get("year") || undefined;

    const rows = await sbSelectAll("orders", { limit: 10000 });
    const buckets: Record<string, { label: string; revenue: number; orders: number }> = {};

    for (const r of rows) {
      if (r.deleted_at != null || r.status !== "completed") continue;
      const ts = r.timestamp ?? 0;
      const d = new Date(ts - BUSINESS_SHIFT_MS);
      // Format in Asia/Karachi timezone
      const monthStr = d.toLocaleString("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit" });
      const yearStr = d.toLocaleString("en-CA", { timeZone: "Asia/Karachi", year: "numeric" });
      let label: string;
      if (scope === "month") {
        if (month && monthStr !== month) continue;
        label = d.toLocaleString("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" });
      } else {
        if (year && yearStr !== year) continue;
        label = monthStr;
      }
      if (!buckets[label]) buckets[label] = { label, revenue: 0, orders: 0 };
      buckets[label].revenue += r.total ?? 0;
      buckets[label].orders++;
    }

    const result = Object.values(buckets).sort((a, b) => a.label.localeCompare(b.label));
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
