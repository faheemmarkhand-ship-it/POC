"use client";

import { useState, useMemo, useRef } from "react";
import { usePosStore } from "@/stores/pos-store";
import { reorderCategories } from "@/lib/repositories";
import { showToast } from "@/components/pos/Toast";
import { confirmDialog } from "@/components/pos/ConfirmModal";
import {
  sortProducts,
  productCardStyle,
  cartDisplayName,
  cartTotal,
  nextOrderId,
  formatOrderId,
} from "@/lib/pos-utils";
import type { Category, Product, CartItem } from "@/types/pos";

export function PosTab() {
  const categories = usePosStore((s) => s.categories);
  const products = usePosStore((s) => s.products);
  const orders = usePosStore((s) => s.orders);
  const cart = usePosStore((s) => s.cart);
  const addToCart = usePosStore((s) => s.addToCart);
  const removeFromCart = usePosStore((s) => s.removeFromCart);
  const updateQty = usePosStore((s) => s.updateCartItemQuantity);
  const clearCart = usePosStore((s) => s.clearCart);
  const cartSidebarOpen = usePosStore((s) => s.cartSidebarOpen);
  const setCartSidebarOpen = usePosStore((s) => s.setCartSidebarOpen);
  const setPendingOrder = usePosStore((s) => s.setPendingOrder);
  const setReceiptModalOpen = usePosStore((s) => s.setReceiptModalOpen);

  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | number>("all");
  const [manualCategory, setManualCategory] = useState<string>("");
  const [manualPrice, setManualPrice] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Drag-and-drop state for category reordering
  const dragId = useRef<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  // Minimize state: when a category is minimized, its product cards are hidden
  // but the header remains visible (so you can drag to reorder).
  const [minimizedCats, setMinimizedCats] = useState<Set<number>>(new Set());
  const toggleMinimize = (id: number) => {
    setMinimizedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Filtered + sorted products
  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(t));
    }
    if (activeCategory !== "all") {
      list = list.filter((p) => String(p.categoryId) === String(activeCategory));
    }
    return sortProducts(list);
  }, [products, searchTerm, activeCategory]);

  // Group by category (preserving category order)
  const grouped = useMemo(() => {
    const map = new Map<number, Product[]>();
    filteredProducts.forEach((p) => {
      const key = p.categoryId ?? 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return map;
  }, [filteredProducts]);

  const orphaned = useMemo(
    () => filteredProducts.filter((p) => !categories.some((c) => c.id === p.categoryId)),
    [filteredProducts, categories]
  );

  const handleAddCustom = () => {
    if (!manualCategory || !manualPrice) {
      showToast("Please select category and enter price", "error");
      return;
    }
    const price = parseFloat(manualPrice);
    if (isNaN(price) || price <= 0) {
      showToast("Please enter a valid price", "error");
      return;
    }
    const category = categories.find((c) => String(c.id) === manualCategory);
    const product: CartItem = {
      id: `custom_${Date.now()}`,
      name: category ? category.name : "Custom",
      price,
      isCustom: true,
      categoryId: parseInt(manualCategory),
      quantity: 1,
      total: price,
    };
    addToCart(product as any);
    setManualPrice("");
    showToast("Added to cart", "success");
  };

  const total = cartTotal(cart);

  const handleCheckout = () => {
    if (cart.length === 0) return;
    const nextId = nextOrderId(orders);
    const formattedId = formatOrderId(nextId);
    setPendingOrder({
      id: nextId,
      dbId: nextId,
      timestamp: Date.now(),
      items: [...cart],
      total,
      status: "completed",
    } as any);
    setReceiptModalOpen(true);
  };

  // Drag-and-drop reorder
  const handleDrop = async (targetId: number) => {
    if (dragId.current == null || dragId.current === targetId) return;
    // SWAP positions: the dragged category and the target category exchange places
    const reordered = [...categories];
    const fromIdx = reordered.findIndex((c) => c.id === dragId.current);
    const toIdx = reordered.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    // Swap the two elements
    [reordered[fromIdx], reordered[toIdx]] = [reordered[toIdx], reordered[fromIdx]];
    // Update positions on the swapped items
    reordered.forEach((c, i) => { c.position = i; });
    // Immediately update the local store so the UI re-renders with new order
    usePosStore.getState().setCategories([...reordered]);
    // Persist to DB + sync
    const idOrderMap: Record<string, number> = {};
    reordered.forEach((c, i) => (idOrderMap[String(c.id)] = i));
    dragId.current = null;
    setDragOverId(null);
    await reorderCategories(idOrderMap);
    showToast("Categories swapped", "success");
  };

  return (
    <div className={`pos-layout ${cartSidebarOpen ? "sidebar-open" : ""}`}>
      {/* Floating cart button (mobile, when cart closed) */}
      {cart.length > 0 && !cartSidebarOpen && (
        <button className="floating-cart-btn" onClick={() => setCartSidebarOpen(true)} aria-label="Open cart">
          <i className="fas fa-shopping-cart"></i>
          <span className="floating-cart-count">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
          <span className="floating-cart-amount">Rs. {total}</span>
        </button>
      )}
      {/* Product Selection Area */}
      <div className="products-section">
        <div className="products-header">
          <h2>Menu Items</h2>
        </div>

        {/* Manual KG Entry Section */}
        <div className="manual-kg-entry-section">
          <h3>Add Custom Item</h3>
          <div className="manual-kg-form">
            <div className={`custom-dropdown ${dropdownOpen ? "active" : ""}`} id="manualKgDropdown">
              <input type="hidden" id="manualKgCategory" value={manualCategory} />
              <div
                className="dropdown-selected"
                onClick={() => setDropdownOpen((v) => !v)}
              >
                <span id="selectedCategoryText">
                  {manualCategory
                    ? (() => {
                        const c = categories.find((c) => String(c.id) === manualCategory);
                        return c ? `${c.emoji} ${c.name}` : "Select Category";
                      })()
                    : "Select Category"}
                </span>
              </div>
              <div className="dropdown-list" id="manualKgDropdownList">
                {categories.map((c) => (
                  <div
                    key={c.id}
                    className="dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      setManualCategory(String(c.id));
                      setDropdownOpen(false);
                    }}
                  >
                    <span className="item-emoji">{c.emoji}</span>
                    <span className="item-name">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <input
              type="number"
              id="manualKgPrice"
              placeholder="Enter Price (Rs.)"
              className="form-input"
              min="1"
              step="1"
              value={manualPrice}
              onChange={(e) => setManualPrice(e.target.value)}
            />
            <button
              className="btn-add-custom"
              onClick={handleAddCustom}
              style={{ flex: 1, padding: "12px 24px", fontSize: "1.1rem", fontWeight: 600 }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Products Grid */}
        <div className="products-grid" id="productsGrid">
          {categories.map((category) => {
            const catProducts = grouped.get(category.id);
            if (!catProducts || catProducts.length === 0) return null;
            return (
              <div
                key={category.id}
                className={`pos-category-section ${dragOverId === category.id ? "drag-over" : ""}`}
                draggable
                data-id={category.id}
                onDragStart={(e) => {
                  dragId.current = category.id;
                  e.currentTarget.classList.add("dragging");
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
                <div className="pos-category-header" style={{ borderLeftColor: category.color }}>
                  <h3>
                    <span className="category-emoji">{category.emoji}</span>
                    <span>{category.name}</span>
                  </h3>
                  <div className="header-actions">
                    <button
                      className="pos-minimize-btn"
                      onClick={(e) => { e.stopPropagation(); toggleMinimize(category.id); }}
                      title={minimizedCats.has(category.id) ? "Expand products" : "Minimize (hide products)"}
                    >
                      <i className={`fas ${minimizedCats.has(category.id) ? "fa-expand" : "fa-minus"}`}></i>
                    </button>
                    <span className="pos-drag-handle" title="Drag to reorder">
                      <i className="fas fa-grip-vertical"></i>
                    </span>
                  </div>
                </div>
                {!minimizedCats.has(category.id) && (
                <div className="category-products-grid">
                  {catProducts.map((p) => {
                    const qType = (p.quantityType || "").toLowerCase();
                    const qtyLabel =
                      qType && qType !== "pcs" && qType !== "pieces" ? p.quantityType : "";
                    return (
                      <div
                        key={p.id}
                        className="product-card"
                        data-category={category.name.toLowerCase().replace(/\s+/g, "")}
                        style={productCardStyle(category)}
                        onClick={(e) => {
                          e.stopPropagation();
                          addToCart(p as any);
                          showToast("Added to cart", "success");
                        }}
                        onMouseEnter={(e) => {
                          if (category.color) {
                            (e.currentTarget as HTMLElement).style.boxShadow = `0 10px 30px ${category.color}40`;
                            (e.currentTarget as HTMLElement).style.transform = "translateY(-8px)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.boxShadow = "none";
                          (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                        }}
                      >
                        <div className="product-card-price">Rs. {p.price}</div>
                        <h3 className="product-card-name">{p.name}</h3>
                        <p className="product-card-quantity">{qtyLabel}</p>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            );
          })}

          {/* Orphaned products */}
          {orphaned.length > 0 && (
            <div className="pos-category-section orphaned-section">
              <div className="pos-category-header orphaned-header" style={{ borderLeftColor: "#666" }}>
                <h3>
                  <span className="category-emoji">📦</span> <span>Other / Orphaned Items</span>
                </h3>
              </div>
              <div className="category-products-grid">
                {orphaned.map((p) => (
                  <div
                    key={p.id}
                    className="product-card"
                    onClick={() => {
                      addToCart(p as any);
                      showToast("Added to cart", "success");
                    }}
                  >
                    <div className="product-card-price">Rs. {p.price}</div>
                    <h3 className="product-card-name">{p.name}</h3>
                    <p className="product-card-quantity">{p.quantityType || ""}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredProducts.length === 0 && (
            <div className="no-data">No products found</div>
          )}
        </div>
      </div>

      {/* Cart Sidebar */}
      <div className={`cart-sidebar ${cartSidebarOpen ? "active" : ""}`} id="cartSidebar">
        <div className="cart-section">
          <div className="cart-header">
            <h2>Current Order</h2>
            <div className="cart-header-actions">
              <button
                className="btn-text btn-danger"
                id="clearCartBtn"
                onClick={() =>
                  confirmDialog({
                    message: "Clear all items from cart?",
                    onConfirm: () => {
                      clearCart();
                      showToast("Cart cleared", "success");
                    },
                  })
                }
              >
                <i className="fas fa-trash"></i> Clear All
              </button>
              <button
                id="closeSidebarBtn"
                className="btn-icon"
                onClick={() => setCartSidebarOpen(false)}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>
          <div className="cart-items max-h-scroll" id="cartItems" style={{ maxHeight: "calc(100vh - 360px)", overflowY: "auto" }}>
            {cart.length === 0 ? (
              <div className="empty-cart">
                <i className="fas fa-shopping-cart empty-icon"></i>
                <p>Your cart is empty</p>
                <p className="empty-subtitle">Add items to get started</p>
              </div>
            ) : (
              cart.map((item, index) => {
                const category = categories.find((c) => c.id === item.categoryId);
                const displayName = cartDisplayName(item);
                return (
                  <div
                    key={`${item.id}-${index}`}
                    className="cart-item"
                    style={
                      category?.color
                        ? {
                            borderColor: category.color,
                            background: `linear-gradient(135deg, ${category.color}15 0%, ${category.color}05 100%)`,
                          }
                        : {}
                    }
                  >
                    <div className="cart-item-info">
                      <h4 className="cart-item-name">{displayName}</h4>
                      <p className="cart-item-price">
                        {item.quantity} x Rs. {item.price}
                      </p>
                    </div>
                    <div className="cart-item-actions">
                      <div className="quantity-controls">
                        <button
                          className="quantity-btn"
                          onClick={() => updateQty(index, -1)}
                        >
                          -
                        </button>
                        <span className="quantity-display">{item.quantity}</span>
                        <button
                          className="quantity-btn"
                          onClick={() => updateQty(index, 1)}
                        >
                          +
                        </button>
                      </div>
                      <div
                        className="cart-item-amount"
                        style={{ margin: "0 10px", minWidth: "60px", textAlign: "right" }}
                      >
                        Rs. {item.total}
                      </div>
                      <button
                        className="remove-item"
                        onClick={() => removeFromCart(index)}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="checkout-controls">
            <button
              className="btn-primary btn-checkout"
              id="checkoutBtn"
              disabled={cart.length === 0}
              onClick={handleCheckout}
            >
              <span className="btn-text" style={{ color: "white", fontSize: "1.3rem", fontWeight: 700, fontFamily: "'Times New Roman', serif" }}>
                Process Payment
              </span>
              <span
                className="btn-amount"
                id="checkoutAmount"
                style={{ color: "white", fontSize: "1.6rem", fontWeight: 900, fontFamily: "'Times New Roman', serif" }}
              >
                <span style={{ fontSize: "0.9rem", opacity: 0.9, marginRight: "8px" }}>TOTAL:</span>
                Rs. {total}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
