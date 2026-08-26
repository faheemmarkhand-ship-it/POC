"use client";
import { usePosStore } from "@/stores/pos-store";

export function Header() {
  const store = usePosStore((s) => s.store);
  const setDbSetupOpen = usePosStore((s) => s.setDbSetupOpen);
  const dataLoaded = usePosStore((s) => s.dataLoaded);

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo-section logo-section-inline">
          <div className="logo logo-badge">NB</div>
        </div>
        <div className="store-info">
          <h1>{store.name || "Naseeb Biryani and Pakwan Center"}</h1>
        </div>
        <div className="header-window-controls">
          <button
            className="header-icon-btn close-btn"
            title="Close System"
            onClick={() => { if (dataLoaded) setDbSetupOpen(true); }}
            aria-label="Close"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      </div>
    </header>
  );
}
