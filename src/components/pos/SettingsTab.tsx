"use client";

import { useState, useEffect } from "react";
import { usePosStore } from "@/stores/pos-store";
import {
  updateStoreInfo,
  createCategory,
  deleteCategory,
  loadData,
  syncNow,
  pullFromServer,
} from "@/lib/repositories";
import { openCategoryModal } from "@/components/pos/modals/CategoryModal";
import { showToast } from "@/components/pos/Toast";
import { confirmDialog } from "@/components/pos/ConfirmModal";
import { EMOJI_OPTIONS } from "@/types/pos";
import { subscribeSync, refreshConnectivity, getSyncState } from "@/lib/sync/sync-engine";
import { getPendingSyncCount } from "@/lib/db/offline-db";

export function SettingsTab() {
  const store = usePosStore((s) => s.store);
  const categories = usePosStore((s) => s.categories);
  const products = usePosStore((s) => s.products);
  const setCategories = usePosStore((s) => s.setCategories);
  const setProducts = usePosStore((s) => s.setProducts);
  const setStore = usePosStore((s) => s.setStore);

  // Local form state (mirrors original populateSettingsUI)
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("");

  // Category add form
  const [catName, setCatName] = useState("");
  const [catColor, setCatColor] = useState("#EF4444");
  const [catEmoji, setCatEmoji] = useState("🍛");

  // Sync status
  const [syncState, setSyncState] = useState(getSyncState());
  const [pending, setPending] = useState(0);

  // Populate the local form when the store data arrives (async after DB init).
  // This is the canonical "sync external store → controlled form" pattern.
  useEffect(() => {
    setName(store.name || "");
    setAddress(store.address || "");
    setPhone(store.phone || "");
    setEmail(store.email || "");
    setReceiptHeader(store.receiptHeader || "");
    setReceiptFooter(store.receiptFooter || "");
  }, [store]);

  useEffect(() => {
    const unsub = subscribeSync((s) => {
      setSyncState(s);
      setPending(getPendingSyncCount());
    });
    refreshConnectivity();
    const i = setInterval(() => {
      setPending(getPendingSyncCount());
    }, 3000);
    return () => {
      unsub();
      clearInterval(i);
    };
  }, []);

  const handleSaveStore = async () => {
    await updateStoreInfo({ name, address, phone, email });
    const data = await loadData();
    setStore(data.store);
    showToast("Store Info Saved", "success");
  };

  const handleSaveReceipt = async () => {
    await updateStoreInfo({ receiptHeader, receiptFooter });
    const data = await loadData();
    setStore(data.store);
    showToast("Receipt Settings Saved", "success");
  };

  const handleAddCategory = async () => {
    if (!catName.trim()) {
      showToast("Please enter a category name", "error");
      return;
    }
    await createCategory({ name: catName.trim(), color: catColor, emoji: catEmoji });
    const data = await loadData();
    setCategories(data.categories);
    setProducts(data.products);
    showToast("Category Added", "success");
    setCatName("");
    setCatColor("#EF4444");
    setCatEmoji("🍛");
  };

  const handleDeleteCategory = (id: number) => {
    const hasProducts = products.some((p) => String(p.categoryId) === String(id));
    if (hasProducts) {
      showToast(
        "Cannot delete category: It still contains products. Delete products first!",
        "error"
      );
      return;
    }
    confirmDialog({
      message: "Are you sure you want to delete this category?",
      onConfirm: async () => {
        await deleteCategory(id);
        const data = await loadData();
        setCategories(data.categories);
        showToast("Category Deleted", "success");
      },
    });
  };

  const handleSyncNow = async () => {
    showToast("Syncing...", "info");
    try {
      await syncNow();
      await pullFromServer();
      const data = await loadData();
      setCategories(data.categories);
      setProducts(data.products);
      setStore(data.store);
      showToast("Sync complete", "success");
    } catch (e) {
      showToast("Sync failed", "error");
    }
  };

  const isOnline = syncState.online;
  const statusLabel = !isOnline
    ? "Offline"
    : syncState.status === "syncing"
    ? "Syncing..."
    : syncState.status === "sync-error"
    ? "Sync Error"
    : syncState.status === "synced"
    ? "Synced"
    : "Online";
  const statusClass = !isOnline
    ? "disconnected"
    : syncState.status === "sync-error"
    ? "error"
    : syncState.status === "syncing"
    ? "uploading"
    : "connected";

  return (
    <div className="settings-grid">
      {/* System Connectivity */}
      <div className="settings-section" style={{ gridColumn: "1 / -1" }}>
        <h3>
          <i className="fas fa-network-wired"></i> System Connectivity
        </h3>
        <div
          style={{
            display: "flex",
            gap: "20px",
            alignItems: "center",
            padding: "10px",
            background: "var(--gray-50)",
            borderRadius: "8px",
            flexWrap: "wrap",
          }}
        >
          <div className={`gdrive-status ${statusClass}`}>
            <i className="fas fa-circle"></i>
            <span>Server: {statusLabel}</span>
          </div>
          <div className="gdrive-status connected">
            <i className="fas fa-database"></i>
            <span>Local DB Active</span>
          </div>
          {pending > 0 && (
            <div className="gdrive-status uploading">
              <i className="fas fa-cloud-upload-alt"></i>
              <span>{pending} pending sync</span>
            </div>
          )}
          <button
            className="btn-primary"
            onClick={handleSyncNow}
            disabled={!isOnline}
            style={!isOnline ? { opacity: 0.5, cursor: "not-allowed" } : {}}
          >
            <i className="fas fa-sync"></i> Sync Now
          </button>
        </div>
      </div>

      {/* Store Information */}
      <div className="settings-section">
        <h3>Store Information</h3>
        <div className="form-group">
          <label htmlFor="storeName">Store Name</label>
          <input
            type="text"
            id="storeName"
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="storeAddress">Address</label>
          <textarea
            id="storeAddress"
            className="form-input"
            rows={3}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="storePhone">Phone</label>
          <input
            type="tel"
            id="storePhone"
            className="form-input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="storeEmail">Email / Note</label>
          <input
            type="text"
            id="storeEmail"
            className="form-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <button className="btn-primary" id="saveStoreInfo" onClick={handleSaveStore}>
          <i className="fas fa-save"></i> Save Changes
        </button>
      </div>

      {/* Category Management */}
      <div className="settings-section">
        <h3>Category Management</h3>
        <div className="form-group">
          <label htmlFor="categoryName">Category Name</label>
          <input
            type="text"
            id="categoryName"
            className="form-input"
            placeholder="Enter category name"
            value={catName}
            onChange={(e) => setCatName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="categoryColor">Category Color</label>
          <div className="color-picker-wrapper">
            <input
              type="color"
              id="categoryColor"
              className="form-input color-picker"
              value={catColor}
              onChange={(e) => setCatColor(e.target.value)}
            />
            <span
              id="colorDisplay"
              className="color-display"
              style={{ backgroundColor: catColor }}
            />
          </div>
        </div>
        <div className="form-group">
          <label>Category Emoji</label>
          <div className="emoji-picker-container" id="addCategoryEmojiPicker">
            {EMOJI_OPTIONS.map((em) => (
              <div
                key={em}
                className={`emoji-option ${catEmoji === em ? "selected" : ""}`}
                data-emoji={em}
                onClick={() => setCatEmoji(em)}
              >
                {em}
              </div>
            ))}
          </div>
          <input type="hidden" id="categoryEmoji" value={catEmoji} />
        </div>
        <button className="btn-primary" id="addCategoryBtn" onClick={handleAddCategory}>
          <i className="fas fa-plus"></i> Add Category
        </button>
        <div id="categoriesList" className="categories-list" style={{ marginTop: "20px" }}>
          {categories.map((c) => (
            <div
              key={c.id}
              className="category-item"
              style={{ borderLeftColor: c.color }}
            >
              <div className="category-info">
                <span className="category-emoji">{c.emoji}</span>
                <strong className="category-name">{c.name}</strong>
              </div>
              <div className="category-actions">
                <button
                  className="btn-sm btn-edit"
                  onClick={() => openCategoryModal(c.id)}
                >
                  <i className="fas fa-edit"></i> Edit
                </button>
                <button
                  className="btn-sm btn-delete"
                  onClick={() => handleDeleteCategory(c.id)}
                >
                  <i className="fas fa-trash"></i> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Receipt Header & Footer */}
      <div className="settings-section">
        <h3>Receipt Header & Footer</h3>
        <div className="form-group">
          <label htmlFor="receiptHeader">Receipt Header</label>
          <input
            type="text"
            id="receiptHeader"
            className="form-input"
            value={receiptHeader}
            onChange={(e) => setReceiptHeader(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="receiptFooter">Receipt Footer</label>
          <input
            type="text"
            id="receiptFooter"
            className="form-input"
            value={receiptFooter}
            onChange={(e) => setReceiptFooter(e.target.value)}
          />
        </div>
        <button className="btn-primary" id="saveReceiptSettings" onClick={handleSaveReceipt}>
          <i className="fas fa-save"></i> Save Receipt Settings
        </button>
      </div>
    </div>
  );
}
