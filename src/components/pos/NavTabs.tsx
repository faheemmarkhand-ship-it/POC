"use client";
import { useEffect, useState } from "react";
import { usePosStore } from "@/stores/pos-store";
import { ConnectivityIndicator } from "./ConnectivityIndicator";
import { getPendingSyncCount } from "@/lib/db/offline-db";
import type { TabName } from "@/stores/pos-store";

const TABS: { id: TabName; icon: string; label: string; mobileLabel?: string }[] = [
  { id: "pos", icon: "fa-credit-card", label: "POS", mobileLabel: "New Sale" },
  { id: "sales", icon: "fa-chart-bar", label: "Sales" },
  { id: "menu", icon: "fa-utensils", label: "Menu" },
  { id: "settings", icon: "fa-cog", label: "Settings" },
];

export function NavTabs() {
  const activeTab = usePosStore((s) => s.activeTab);
  const setActiveTab = usePosStore((s) => s.setActiveTab);
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setPending(getPendingSyncCount()), 3000);
    return () => clearInterval(i);
  }, []);
  return (
    <nav className="nav-tabs" role="tablist">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
          data-tab={tab.id}
          onClick={() => setActiveTab(tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
        >
          <i className={`fas ${tab.icon} tab-icon`}></i>
          <span className="tab-text">{tab.mobileLabel || tab.label}</span>
          {tab.id === "settings" && pending > 0 && (
            <span className="tab-badge" title={`${pending} pending sync`}>{pending}</span>
          )}
        </button>
      ))}
      <ConnectivityIndicator />
    </nav>
  );
}
