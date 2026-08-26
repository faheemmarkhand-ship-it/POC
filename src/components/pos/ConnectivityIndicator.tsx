"use client";

import { useEffect, useState } from "react";
import { usePosStore } from "@/stores/pos-store";
import { subscribeSync, refreshConnectivity, getSyncState } from "@/lib/sync/sync-engine";
import { getPendingSyncCount } from "@/lib/db/offline-db";
import type { SyncStatus } from "@/types/pos";

const STATUS_META: Record<SyncStatus, { icon: string; label: string; cls: string }> = {
  online: { icon: "fa-database", label: "Online", cls: "online" },
  offline: { icon: "fa-database", label: "Offline", cls: "" },
  syncing: { icon: "fa-spinner fa-spin", label: "Syncing...", cls: "syncing" },
  synced: { icon: "fa-check-circle", label: "Synced", cls: "synced" },
  "sync-error": { icon: "fa-exclamation-circle", label: "Sync Error", cls: "sync-error" },
};

export function ConnectivityIndicator() {
  const [state, setState] = useState(getSyncState());

  useEffect(() => {
    const unsub = subscribeSync((s) => setState(s));
    // Refresh immediately + every 15s (matches original interval).
    refreshConnectivity();
    const interval = setInterval(() => {
      refreshConnectivity();
    }, 15000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const isOnline = state.online;
  const status: SyncStatus = isOnline ? state.status : "offline";
  const meta = STATUS_META[status];
  const pending = getPendingSyncCount();
  const label = state.status === "syncing" ? meta.label : isOnline ? (pending > 0 ? `${meta.label} (${pending})` : meta.label) : "Offline";

  return (
    <div className="connectivity-status">
      <div
        id="connectivityIndicator"
        className={`connectivity-indicator ${isOnline ? meta.cls : ""}`}
        title={isOnline ? "Connected to server" : "Offline — using local database"}
        suppressHydrationWarning
      >
        <i className={`fas ${meta.icon}`}></i> <span suppressHydrationWarning>{label}</span>
      </div>
    </div>
  );
}
