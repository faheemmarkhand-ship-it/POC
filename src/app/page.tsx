"use client";

import { usePosStore } from "@/stores/pos-store";
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

export default function Home() {
  const activeTab = usePosStore((s) => s.activeTab);
  const dataLoaded = usePosStore((s) => s.dataLoaded);

  return (
    <div className="app-container">
      <Header />
      <NavTabs />
      <main className="main-content">
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
