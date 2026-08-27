"use client";

import { useMemo, useState, useRef } from "react";
import { usePosStore } from "@/stores/pos-store";
import { deleteProduct, loadData, reorderCategories } from "@/lib/repositories";
import { openProductModal } from "@/components/pos/modals/ProductModal";
import { showToast } from "@/components/pos/Toast";
import { confirmDialog } from "@/components/pos/ConfirmModal";
import type { Category } from "@/types/pos";

export function MenuTab() {
  const categories = usePosStore((s) => s.categories);
  const products = usePosStore((s) => s.products);
  const setProducts = usePosStore((s) => s.setProducts);
  const setCategories = usePosStore((s) => s.setCategories);

  // Track which categories are collapsed (items hidden). Default: all expanded.
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  // Track which categories are minimized (compact view, no product cards).
  const [minimized, setMinimized] = useState<Set<number>>(new Set());

  const toggleCategory = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMinimize = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setMinimized((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Drag-and-drop reorder
  const dragId = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);

  const handleDrop = async (targetId: number) => {
    if (dragId.current == null || dragId.current === targetId) return;
    const ids = categories.map((c) => c.id);
    const fromIdx = ids.indexOf(dragId.current);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    const idOrderMap: Record<string, number> = {};
    reordered.forEach((c, i) => (idOrderMap[String(c.id)] = i));
    dragId.current = null;
    setDragOverId(null);
    await reorderCategories(idOrderMap);
    showToast("Category order saved", "success");
  };

  const orphaned = useMemo(
    () =>
      products.filter(
        (p) => !p.categoryId || !categories.some((c) => c.id === p.categoryId)
      ),
    [products, categories]
  );

  const handleDelete = async (id: number) => {
    confirmDialog({
      message:
        "Are you sure you want to delete this product? This will remove it from all views.",
      onConfirm: async () => {
        await deleteProduct(id);
        const data = await loadData();
        setProducts(data.products);
        setCategories(data.categories);
        showToast("Product Deleted", "success");
      },
    });
  };

  return (
    <div>
      <div className="menu-header">
        <h2>Menu Management</h2>
        <button className="btn-primary" id="addProductBtn" onClick={() => openProductModal()}>
          <i className="fas fa-plus"></i> Add Product
        </button>
      </div>
      <div className="menu-grid" id="menuGrid">
        {categories.map((category: Category) => {
          const catProducts = products.filter((p) => String(p.categoryId) === String(category.id));
          const isCollapsed = collapsed.has(category.id);
          const isMinimized = minimized.has(category.id);
          return (
            <div
              key={category.id}
              className={`menu-category-section ${isCollapsed ? "collapsed" : ""} ${dragOverId === category.id ? "drag-over" : ""}`}
              style={{ marginBottom: "20px" }}
              draggable
              onDragStart={(e) => {
                dragId.current = category.id;
                e.currentTarget.classList.add("dragging");
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={(e) => {
                e.currentTarget.classList.remove("dragging");
                setDragOverId(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragId.current !== null && dragId.current !== category.id) {
                  setDragOverId(category.id);
                }
              }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(category.id);
              }}
            >
              {/* Category header — toggle + minimize + drag handle */}
              <div
                className="menu-category-header"
                style={{
                  backgroundColor: `${category.color}20`,
                  borderLeftColor: category.color,
                  padding: "10px 15px",
                  borderRadius: "8px",
                  marginBottom: isMinimized ? "0" : "15px",
                }}
                onClick={() => toggleCategory(category.id)}
              >
                <h3 style={{ margin: 0, color: "#333", display: "flex", alignItems: "center", flex: 1, minWidth: 0 }}>
                  <span style={{ marginRight: "10px" }}>{category.emoji}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{category.name}</span>
                  <span style={{ marginLeft: "8px", fontSize: "0.8rem", color: "#9CA3AF", fontWeight: 500, flexShrink: 0 }}>
                    ({catProducts.length})
                  </span>
                </h3>
                <div className="header-actions">
                  {/* Minimize button — stops propagation so it doesn't toggle collapse */}
                  <button
                    className="menu-minimize-btn"
                    onClick={(e) => { e.stopPropagation(); toggleMinimize(category.id, e); }}
                    title={isMinimized ? "Expand to show products" : "Minimize (hide product cards)"}
                  >
                    <i className={`fas ${isMinimized ? "fa-expand" : "fa-minus"}`}></i>
                  </button>
                  {/* Toggle (collapse) chevron — stops propagation, uses its own click */}
                  <span
                    className="menu-category-toggle"
                    title={isCollapsed ? "Expand" : "Collapse"}
                    onClick={(e) => { e.stopPropagation(); toggleCategory(category.id); }}
                  >
                    <i className="fas fa-chevron-down"></i>
                  </span>
                  {/* Drag handle */}
                  <span
                    className="menu-drag-handle"
                    title="Drag to reorder"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <i className="fas fa-grip-vertical"></i>
                  </span>
                </div>
              </div>
              {/* Product grid — hidden when collapsed OR minimized */}
              {!isCollapsed && !isMinimized && (
                <div
                  className="menu-category-items"
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: "15px",
                  }}
                >
                  {catProducts.length === 0 ? (
                    <div style={{ color: "#999", fontStyle: "italic" }}>
                      No items in this category
                    </div>
                  ) : (
                    catProducts.map((p) => (
                      <div
                        key={p.id}
                        className="product-card menu-card"
                        style={{
                          backgroundColor: `${category.color}10`,
                          border: `3px solid ${category.color}`,
                          padding: "16px",
                          display: "flex",
                          flexDirection: "column",
                          minHeight: "160px",
                          aspectRatio: "auto",
                          overflow: "visible",
                        }}
                      >
                        <div style={{ flexGrow: 1 }}>
                          <h4
                            style={{
                              margin: "0 0 8px 0",
                              fontSize: "1.1rem",
                              color: "#1f2937",
                              fontWeight: 700,
                              lineHeight: 1.2,
                            }}
                          >
                            {p.name}
                          </h4>
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span
                              style={{ fontWeight: 800, color: category.color, fontSize: "1.2rem" }}
                            >
                              Rs. {p.price}
                            </span>
                            <span
                              style={{ fontSize: "1.15rem", color: "#1f2937", fontWeight: 800 }}
                            >
                              Qty: {p.quantityType || "pcs"}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            marginTop: "12px",
                            display: "flex",
                            gap: "6px",
                            justifyContent: "flex-end",
                            borderTop: `1px solid ${category.color}20`,
                            paddingTop: "10px",
                          }}
                        >
                          <button
                            className="btn-secondary btn-small"
                            onClick={() => openProductModal(p.id)}
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            className="btn-danger btn-small"
                            onClick={() => handleDelete(p.id)}
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Orphaned products */}
        {orphaned.length > 0 && (
          <div
            className="menu-category-section orphaned-section"
            style={{
              marginTop: "40px",
              padding: "24px",
              borderRadius: "var(--radius-xl)",
              background: "rgba(239, 68, 68, 0.03)",
              border: "2px dashed rgba(239, 68, 68, 0.3)",
            }}
          >
            <h3
              style={{
                margin: "0 0 12px 0",
                color: "#DC2626",
                display: "flex",
                alignItems: "center",
                fontWeight: 700,
              }}
            >
              <i className="fas fa-exclamation-triangle" style={{ marginRight: "12px" }}></i>
              Items Needing Attention (Orphaned)
            </h3>
            <p
              style={{
                fontSize: "0.95rem",
                color: "#64748b",
                marginBottom: "24px",
                lineHeight: 1.5,
              }}
            >
              These items belong to categories that have been deleted. You can re-assign them to a
              new category by clicking <strong>Edit</strong>, or remove them permanently.
            </p>
            <div
              className="menu-category-items"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: "20px",
              }}
            >
              {orphaned.map((p) => (
                <div
                  key={p.id}
                  className="product-card menu-card"
                  style={{
                    backgroundColor: "#ffffff",
                    border: "3px solid #cbd5e1",
                    padding: "16px",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: "180px",
                    aspectRatio: "auto",
                    overflow: "visible",
                  }}
                >
                  <div style={{ flexGrow: 1 }}>
                    <h4
                      style={{
                        margin: "0 0 8px 0",
                        fontSize: "1.1rem",
                        color: "#1e293b",
                        fontWeight: 700,
                        lineHeight: 1.2,
                      }}
                    >
                      {p.name}
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span
                        style={{ fontWeight: 800, color: "#DC2626", fontSize: "1.25rem" }}
                      >
                        Rs. {p.price}
                      </span>
                      <span
                        style={{ fontSize: "1.15rem", color: "#1e293b", fontWeight: 800 }}
                      >
                        Qty: {p.quantityType || "pcs"}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "8px" }}>
                      <i className="fas fa-exclamation-circle"></i> No Category
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: "12px",
                      display: "flex",
                      gap: "6px",
                      justifyContent: "flex-end",
                      borderTop: "1px solid #f1f5f9",
                      paddingTop: "10px",
                    }}
                  >
                    <button
                      className="btn-secondary btn-small"
                      onClick={() => openProductModal(p.id)}
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button
                      className="btn-danger btn-small"
                      onClick={() => handleDelete(p.id)}
                    >
                      <i className="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
