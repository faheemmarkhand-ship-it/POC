"use client";

import { useEffect, useState } from "react";
import { usePosStore } from "@/stores/pos-store";
import { createProduct, updateProduct, loadData } from "@/lib/repositories";
import { showToast } from "@/components/pos/Toast";
import { QUANTITY_OPTIONS } from "@/types/pos";
import type { Product, ProductInput } from "@/types/pos";

// Module-level controller so other components can open the modal.
let openExternal: ((editingId?: number | null) => void) | null = null;
export function openProductModal(editingId?: number | null) {
  if (openExternal) openExternal(editingId);
}

export function ProductModal() {
  const categories = usePosStore((s) => s.categories);
  const setCategories = usePosStore((s) => s.setCategories);
  const setProducts = usePosStore((s) => s.setProducts);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [qtyValue, setQtyValue] = useState("pcs");
  const [customQtyText, setCustomQtyText] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    openExternal = (eid?: number | null) => {
      setOpen(true);
      setEditingId(eid ?? null);
      if (eid != null) {
        const product = usePosStore.getState().products.find((p) => p.id === eid);
        if (product) {
          setName(product.name);
          setCategoryId(String(product.categoryId));
          const matched = QUANTITY_OPTIONS.find(
            (o) => o.display === product.quantityType || o.value === product.quantityType
          );
          if (matched) {
            setQtyValue(matched.value);
          } else {
            setQtyValue("custom");
            setCustomQtyText(product.quantityType);
          }
          setPrice(String(product.price));
        }
      } else {
        setName("");
        setCategoryId("");
        setQtyValue("pcs");
        setCustomQtyText("");
        setPrice("");
      }
    };
    return () => {
      openExternal = null;
    };
  }, []);

  const close = () => setOpen(false);

  const selectedQty = qtyValue;
  const isPcs = selectedQty === "pcs";
  const isCustom = selectedQty === "custom";
  const showQtyGroup = !!categoryId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast("Please enter a product name", "error");
      return;
    }
    if (!categoryId) {
      showToast("Please select a category", "error");
      return;
    }
    const priceNum = parseFloat(price);
    if (!priceNum || priceNum <= 0) {
      showToast("Please enter a valid price for this item", "error");
      return;
    }

    const qtyOpt = QUANTITY_OPTIONS.find((o) => o.value === selectedQty);
    let quantityType = qtyOpt ? qtyOpt.display : "Pieces";
    if (isCustom) {
      quantityType = customQtyText.trim() || "Custom";
    }

    const input: ProductInput = {
      name: trimmedName,
      price: priceNum,
      categoryId,
      quantityType,
      isCustom: false,
    };

    if (editingId != null) {
      await updateProduct({
        ...(input as Omit<Product, "id">),
        id: editingId,
        categoryId: parseInt(categoryId),
      });
      showToast("Product Updated", "success");
    } else {
      await createProduct(input);
      showToast("Product Saved", "success");
    }

    const data = await loadData();
    setCategories(data.categories);
    setProducts(data.products);
    setOpen(false);
  };

  return open ? (
    <div className="modal active" id="productModal">
      <div className="modal-content">
        <div className="modal-header">
          <h3 id="productModalTitle">{editingId != null ? "Edit Product" : "Add Product"}</h3>
          <button className="modal-close" id="closeProductModal" onClick={close}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <form id="productForm" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="productName">Product Name</label>
            <input
              type="text"
              id="productName"
              className="form-input"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="productCategory">Category</label>
            <select
              id="productCategory"
              className="form-input"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </div>

          {showQtyGroup && (
            <div className="form-group" id="quantityPricesGroup">
              <label>Select Quantity Type</label>
              <div className="quantity-options">
                {QUANTITY_OPTIONS.map((opt) => (
                  <label key={opt.value} className="quantity-radio-label">
                    <input
                      type="radio"
                      name="productQuantity"
                      value={opt.value}
                      checked={qtyValue === opt.value}
                      onChange={() => setQtyValue(opt.value)}
                    />
                    <span className="quantity-option-text">{opt.label}</span>
                  </label>
                ))}
              </div>
              {isCustom && (
                <div id="customQuantityInput" style={{ marginTop: "12px" }}>
                  <input
                    type="text"
                    id="customQuantityText"
                    className="form-input"
                    placeholder="e.g., Half Piece, 1.5 Kg, Special Mix"
                    maxLength={50}
                    value={customQtyText}
                    onChange={(e) => setCustomQtyText(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {!isPcs && showQtyGroup && (
            <div className="form-group" id="weightPriceGroup">
              <label htmlFor="weightProductPrice">Price for Selected Quantity</label>
              <input
                type="number"
                id="weightProductPrice"
                className="form-input"
                step="1"
                min="1"
                placeholder="e.g., 150, 200, 250"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          )}

          {isPcs && showQtyGroup && (
            <div className="form-group" id="priceFieldGroup">
              <label htmlFor="productPrice">Price</label>
              <input
                type="number"
                id="productPrice"
                className="form-input"
                step="1"
                min="1"
                placeholder="e.g., 40, 80, 150"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <small style={{ color: "var(--gray-600)" }}>
                Price for this individual item
              </small>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" id="cancelProduct" onClick={close}>
              <i className="fas fa-times"></i> Cancel
            </button>
            <button type="submit" className="btn-primary">
              <i className="fas fa-save"></i> Save Product
            </button>
          </div>
        </form>
      </div>
    </div>
  ) : null;
}
