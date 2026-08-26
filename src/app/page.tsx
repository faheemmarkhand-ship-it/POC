"use client";

import { useRef, useEffect } from "react";
import { usePosStore } from "@/stores/pos-store";
import type { TabName } from "@/stores/pos-store";
import { Header } from "@/components/pos/Header";
import { NavTabs } from "@/components/pos/NavTabs";
import { DbSetupModal } from "@/components/pos/DbSetupModal";
import { ConfirmModal } from "@/components/pos/ConfirmModal";
import { ToastContainer } from "@/components/pos/Toast";
import { ProductModal } from "@/components/pos/modals/ProductModal";
import { CategoryModal } from "@/components/pos/modals/CategoryModal";
import { ReceiptModal } from "@/components/pos/modals/ReceiptModal";
import { PriceAdjustModal } from "@/components/pos/modals/PriceAdjustModal";
import { PosTab } from "@/components/pos/PosTab";
import { SalesTab } from "@/components/pos/SalesTab";
import { MenuTab } from "@/components/pos/MenuTab";
import { SettingsTab } from "@/components/pos/SettingsTab";

const TAB_ORDER: TabName[] = ["pos", "sales", "menu", "settings"];

export default function Home() {
  const activeTab = usePosStore((s) => s.activeTab);
  const setActiveTab = usePosStore((s) => s.setActiveTab);
  const dataLoaded = usePosStore((s) => s.dataLoaded);
  const mainRef = useRef<HTMLElement>(null);

  // Swipe left/right to change tabs (mobile) — works on ALL pages
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    let startX = 0;
    let startY = 0;
    let isSwiping = false;
    let tracking = false;

    const onStart = (e: TouchEvent) => {
      // Only exclude truly interactive elements (inputs, modals, cart sidebar)
      // Allow swiping on product cards, menu items, table rows, etc.
      const target = e.target as HTMLElement;
      if (target.closest(".modal, .cart-sidebar, input, select, textarea")) return;
      tracking = true;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isSwiping = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      // Only treat as horizontal swipe if dx > dy (avoid vertical scroll)
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
        isSwiping = true;
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (!tracking || !isSwiping) {
        tracking = false;
        return;
      }
      tracking = false;
      const dx = (e.changedTouches[0].clientX) - startX;
      if (Math.abs(dx) < 80) return; // require a decisive swipe
      const idx = TAB_ORDER.indexOf(activeTab);
      if (dx < 0 && idx < TAB_ORDER.length - 1) {
        // swipe left → next tab
        setActiveTab(TAB_ORDER[idx + 1]);
      } else if (dx > 0 && idx > 0) {
        // swipe right → prev tab
        setActiveTab(TAB_ORDER[idx - 1]);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [activeTab, setActiveTab]);

  return (
    <div className="app-container">
      <Header />
      <NavTabs />
      <main className="main-content" ref={mainRef}>
        <div className={`tab-content ${activeTab === "pos" ? "active" : ""}`} id="pos-tab">
          {activeTab === "pos" && dataLoaded && <PosTab />}
        </div>
        <div className={`tab-content ${activeTab === "sales" ? "active" : ""}`} id="sales-tab">
          {activeTab === "sales" && dataLoaded && <SalesTab />}
        </div>
        <div className={`tab-content ${activeTab === "menu" ? "active" : ""}`} id="menu-tab">
          {activeTab === "menu" && dataLoaded && <MenuTab />}
        </div>
        <div className={`tab-content ${activeTab === "settings" ? "active" : ""}`} id="settings-tab">
          {activeTab === "settings" && dataLoaded && <SettingsTab />}
        </div>
      </main>

      {/* Modals */}
      <DbSetupModal />
      <ProductModal />
      <CategoryModal />
      <ReceiptModal />
      <PriceAdjustModal />
      <ConfirmModal />

      <ToastContainer />
    </div>
  );
}
