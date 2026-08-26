"use client";

import { usePosStore } from "@/stores/pos-store";
import { loadData } from "@/lib/repositories";
import { showToast } from "./Toast";
import { startConnectivityMonitor } from "@/lib/sync/sync-engine";
import { useState } from "react";

export function DbSetupModal() {
  const dbSetupOpen = usePosStore((s) => s.dbSetupOpen);
  const setDbSetupOpen = usePosStore((s) => s.setDbSetupOpen);
  const setData = usePosStore((s) => s.setData);
  const setDataLoaded = usePosStore((s) => s.setDataLoaded);
  const setActiveTab = usePosStore((s) => s.setActiveTab);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setLoading(true);
    try {
      const data = await loadData();
      setData(data);
      setDataLoaded(true);
      setDbSetupOpen(false);
      setActiveTab("pos");
      startConnectivityMonitor();
      showToast("System Ready", "success");
    } catch (e) {
      console.error(e);
      showToast("Failed to load database", "error");
    } finally {
      setLoading(false);
    }
  };

  if (!dbSetupOpen) return null;

  return (
    <div className="modal active db-setup-modal" id="dbSetupModal">
      <div className="modal-content db-setup-content">
        <div className="db-setup-icon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/LOGO.jpg"
            alt="Shop Logo"
            style={{
              width: "140px",
              height: "auto",
              borderRadius: "12px",
              marginBottom: "20px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          />
        </div>
        <h2 className="db-setup-title">Naseeb Biryani and Pakwan Center</h2>

        <button
          className="btn-primary db-setup-button"
          id="openDbBtn"
          onClick={handleOpen}
          disabled={loading}
        >
          <i className="fas fa-database"></i> {loading ? "Loading..." : "Let's Go"}
        </button>

        {loading && (
          <div id="dbLoadingMsg" className="db-loading-message">
            <i className="fas fa-spinner fa-spin"></i> Loading database...
          </div>
        )}
      </div>
    </div>
  );
}
