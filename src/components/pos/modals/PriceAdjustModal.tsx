"use client";

import { useEffect, useState } from "react";
import { usePosStore } from "@/stores/pos-store";
import type { CartItem } from "@/types/pos";

// Price adjustment modal — mirrors the original priceAdjustModal.
interface PriceAdjustState {
  open: boolean;
  index: number;
  item: CartItem | null;
}

let openExternal: ((index: number) => void) | null = null;
export function openPriceAdjust(index: number) {
  if (openExternal) openExternal(index);
}

export function PriceAdjustModal() {
  const cart = usePosStore((s) => s.cart);
  const updateQty = usePosStore((s) => s.updateCartItemQuantity);

  const [state, setState] = useState<PriceAdjustState>({ open: false, index: -1, item: null });
  const [quantity, setQuantity] = useState("1");
  const [totalPrice, setTotalPrice] = useState("");

  useEffect(() => {
    openExternal = (index: number) => {
      const item = usePosStore.getState().cart[index];
      if (!item) return;
      setState({ open: true, index, item });
      setQuantity(String(item.quantity));
      setTotalPrice(String(item.total));
    };
    return () => {
      openExternal = null;
    };
  }, []);

  const close = () => setState({ open: false, index: -1, item: null });

  if (!state.open || !state.item) return null;
  const item = state.item;
  const basePrice = item.price;

  // Auto-calculate: if user edits quantity, update total; if user edits total, update quantity.
  const onQtyChange = (v: string) => {
    setQuantity(v);
    const q = parseFloat(v);
    if (!isNaN(q) && q > 0) {
      setTotalPrice(String(Math.round(q * basePrice)));
    }
  };
  const onTotalChange = (v: string) => {
    setTotalPrice(v);
    const t = parseFloat(v);
    if (!isNaN(t) && basePrice > 0) {
      setQuantity(String(Math.round((t / basePrice) * 100) / 100));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = parseFloat(quantity);
    const t = parseFloat(totalPrice);
    if (isNaN(q) || q <= 0 || isNaN(t) || t <= 0) return;
    // Apply by updating the cart item's quantity + total directly via store.
    // We do this by removing + re-adding with adjusted values to keep it simple.
    const st = usePosStore.getState();
    const newCart = [...st.cart];
    newCart[state.index] = { ...item, quantity: q, total: t, price: basePrice };
    usePosStore.setState({ cart: newCart });
    close();
  };

  return (
    <div className="modal active" id="priceAdjustModal">
      <div className="modal-content" style={{ maxWidth: "450px" }}>
        <div className="modal-header">
          <h3>Adjust Price</h3>
          <button className="modal-close" id="closePriceAdjust" onClick={close}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <form id="priceAdjustForm" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="adjustItemName">Item Name</label>
            <input type="text" id="adjustItemName" className="form-input" disabled value={item.name} />
          </div>
          <div className="form-group">
            <label htmlFor="adjustBasePrice">Base Price (PKR)</label>
            <input type="number" id="adjustBasePrice" className="form-input" step="1" min="0" readOnly value={basePrice} />
            <small style={{ color: "var(--gray-600)" }}>Price per unit (read-only)</small>
          </div>
          <div className="form-group">
            <label htmlFor="adjustQuantity">Quantity</label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <input
                type="number"
                id="adjustQuantity"
                className="form-input"
                step="0.5"
                min="0.5"
                style={{ flex: 1 }}
                value={quantity}
                onChange={(e) => onQtyChange(e.target.value)}
              />
              <span id="adjustUnitDisplay" style={{ minWidth: "50px", textAlign: "center" }}>
                {item.quantityType || ""}
              </span>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="adjustTotalPrice">Total Price (PKR)</label>
            <input
              type="number"
              id="adjustTotalPrice"
              className="form-input"
              step="1"
              min="0"
              value={totalPrice}
              onChange={(e) => onTotalChange(e.target.value)}
            />
            <small style={{ color: "var(--gray-600)" }}>
              Or enter desired price to auto-calculate quantity
            </small>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" id="cancelPriceAdjust" onClick={close}>
              <i className="fas fa-times"></i> Cancel
            </button>
            <button type="submit" className="btn-primary">
              <i className="fas fa-check"></i> Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
