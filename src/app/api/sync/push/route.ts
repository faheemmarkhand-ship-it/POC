import { NextRequest, NextResponse } from "next/server";
import { sbSelectAll, sbSelectById, sbSoftDelete, sbUpdate, sbInsert, nowMs } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // allow up to 30s for large sync pushes

interface SyncChange {
  id: string | number;
  operation: string;
  record: Record<string, any> | null;
}

export async function POST(req: NextRequest) {
  try {
    const { changes, device_id } = await req.json();
    const t = nowMs();
    const applied: Record<string, number> = { categories: 0, products: 0, orders: 0, store_info: 0 };
    const conflicts: any[] = [];

    const tableMap: Record<string, [string, string]> = {
      categories: ["categories", "id"],
      products: ["products", "id"],
      orders: ["orders", "id"],
      store_info: ["store_info", "key"],
    };

    for (const [entityType, changeList] of Object.entries(changes)) {
      if (!tableMap[entityType]) continue;
      const [tableName, idCol] = tableMap[entityType];

      for (const change of changeList as SyncChange[]) {
        try {
          const record = { ...(change.record || {}) };

          // For orders, convert items (array) → items_json (string)
          if (entityType === "orders") {
            if ("items" in record && !("items_json" in record)) {
              record.items_json = JSON.stringify(record.items);
              delete record.items;
            } else if ("items" in record) {
              delete record.items;
            }
          }

          if (change.operation === "delete") {
            await sbSoftDelete(tableName, idCol, change.id, t);
            applied[entityType]++;
            continue;
          }

          // Check for conflict
          const existing = await sbSelectById(tableName, idCol, change.id);
          if (existing) {
            const serverUpdated = existing.updated_at ?? 0;
            const clientUpdated = record.updated_at ?? 0;
            if (serverUpdated > clientUpdated) {
              conflicts.push({
                entity_type: entityType,
                entity_id: change.id,
                server_record: existing,
                client_record: record,
                reason: "server record is newer",
              });
              continue;
            }
            // Update with bumped sync_version
            const updates = { ...record, updated_at: t, sync_version: (existing.sync_version ?? 0) + 1, deleted_at: null };
            await sbUpdate(tableName, idCol, change.id, updates);
          } else {
            // New record — insert
            const inserts: Record<string, unknown> = { ...record };
            if (idCol !== "key" && !("id" in inserts)) {
              inserts[idCol] = /^\d+$/.test(String(change.id)) ? Number(change.id) : change.id;
            }
            inserts.updated_at = t;
            inserts.sync_version = 1;
            inserts.deleted_at = null;
            await sbInsert(tableName, inserts);
          }
          applied[entityType]++;
        } catch (e: any) {
          console.error(`sync push error (${entityType} ${change.id}):`, e.message);
        }
      }
    }

    return NextResponse.json({ applied, conflicts, server_time: t });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
