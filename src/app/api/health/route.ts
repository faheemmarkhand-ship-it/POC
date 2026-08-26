import { NextResponse } from "next/server";
import { sbCount } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const counts = {
      store_info: await sbCount("store_info"),
      categories: await sbCount("categories"),
      products: await sbCount("products"),
      orders: await sbCount("orders"),
    };
    return NextResponse.json({ status: "ok", db: "supabase", counts });
  } catch (e: any) {
    return NextResponse.json({ status: "error", db: "supabase", error: e.message }, { status: 500 });
  }
}
