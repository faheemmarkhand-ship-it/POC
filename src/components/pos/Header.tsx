"use client";
import { usePosStore } from "@/stores/pos-store";

export function Header() {
  const store = usePosStore((s) => s.store);

  return (
    <header className="header">
      <div className="header-content">
        <div className="logo-section logo-section-inline">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/LOGO.jpg" alt="Naseeb Biryani and Pakwan Center" className="logo" />
        </div>
        <div className="store-info">
          <h1>{store.name || "Naseeb Biryani and Pakwan Center"}</h1>
        </div>
      </div>
    </header>
  );
}
