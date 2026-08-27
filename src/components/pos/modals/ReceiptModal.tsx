"use client";

import { useEffect, useRef } from "react";
import { usePosStore } from "@/stores/pos-store";
import { createOrder, loadData } from "@/lib/repositories";
import { showToast } from "@/components/pos/Toast";
import { receiptItemDisplayName, formatOrderId, cartTotal } from "@/lib/pos-utils";
import type { Order, OrderItem, Product, StoreInfo } from "@/types/pos";

export function ReceiptModal() {
  const open = usePosStore((s) => s.receiptModalOpen);
  const setOpen = usePosStore((s) => s.setReceiptModalOpen);
  const pendingOrder = usePosStore((s) => s.pendingOrder);
  const setPendingOrder = usePosStore((s) => s.setPendingOrder);
  const store = usePosStore((s) => s.store);
  const products = usePosStore((s) => s.products);
  const setOrders = usePosStore((s) => s.setOrders);
  const setCategories = usePosStore((s) => s.setCategories);
  const clearCart = usePosStore((s) => s.clearCart);
  const setCartSidebarOpen = usePosStore((s) => s.setCartSidebarOpen);
  const printRef = useRef<HTMLDivElement>(null);

  // Render the receipt HTML for a given copy type (mirrors original renderReceiptHTML).
  const renderReceiptHTML = (order: Order & { dbId?: number }, copyType: "CUSTOMER COPY" | "COUNTER COPY", productsList: Product[], storeInfo: StoreInfo) => {
    const isCounterCopy = copyType === "COUNTER COPY";
    const itemsHTML = order.items
      .map((item: OrderItem) => {
        const displayName = receiptItemDisplayName(item, productsList);
        return `
          <div class="receipt-item">
            <span class="col-product">${displayName}</span>
            <span class="col-qty">${item.quantity}</span>
            <span class="col-unit">${item.price}</span>
            <span class="col-total">${item.price * item.quantity}</span>
          </div>
        `;
      })
      .join("");

    const headerHTML = isCounterCopy
      ? ""
      : `
        <div class="receipt-header">
          <img src="/logo-bw.png" alt="Logo" class="receipt-logo" onError="this.onerror=null;this.src='/r-logo-bw.png';">
          <div class="receipt-store-name">${storeInfo.name || "Naseeb Biryani and Pakwan Center"}</div>
          <div class="receipt-store-info">${storeInfo.address || ""}</div>
          ${storeInfo.phone ? `<div class="receipt-store-info">Mobile: ${storeInfo.phone}</div>` : ""}
          ${storeInfo.email ? `<div class="receipt-store-info">${storeInfo.email}</div>` : ""}
          <div class="receipt-title">SALE INVOICE</div>
        </div>
      `;

    const footerHTML = isCounterCopy
      ? ""
      : `
        <div class="receipt-footer">
          <div>${storeInfo.receiptHeader || "Welcome to Naseeb Biryani"}</div>
          <div class="footer-urdu">${storeInfo.receiptFooter || "Thank you for your visit!"}</div>
        </div>
      `;

    const d = new Date(order.timestamp);
    return `
      <div class="receipt-container">
        <!-- Watermark: actual img element so it PRINTS (CSS pseudo-elements don't print) -->
        <img src="/logo-bw.png" alt="" class="receipt-watermark" onError="this.style.display='none'">
        <div class="receipt-copy">
          <div class="copy-label-box">=== ${copyType} ===</div>
          ${headerHTML}
          <div class="receipt-meta">
            <div class="receipt-meta-row">
              <span>Invoice No.</span>
              <span>${formatOrderId(order.id)}</span>
            </div>
            <div class="receipt-meta-row">
              <span>Date</span>
              <span>${d.toLocaleDateString()}, ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}</span>
            </div>
          </div>
          <div class="receipt-items">
            <div class="receipt-items-header">
              <span class="col-product">PRODUCT</span>
              <span class="col-qty">QTY</span>
              <span class="col-unit">UNIT<br>PRICE</span>
              <span class="col-total">SUBT</span>
            </div>
            ${itemsHTML}
          </div>
          <div class="receipt-totals">
            <div class="receipt-total-line">
              <span>Subtotal:</span>
              <span>Rs ${order.total}</span>
            </div>
            <div class="receipt-total-line final">
              <span>Total:</span>
              <span style="font-size: 1.1em;">Rs ${order.total}</span>
            </div>
            <div class="receipt-total-line">
              <span>Cash Received (${d.toLocaleDateString()})</span>
              <span>Rs ${order.total}</span>
            </div>
          </div>
          ${footerHTML}
        </div>
      </div>
    `;
  };

  // Print receipt (dual print: customer copy + counter copy), then save order.
  const handlePrint = async () => {
    if (!pendingOrder) return;
    try {
      // 1. Save order to DB + clear cart
      const id = await createOrder({
        timestamp: pendingOrder.timestamp,
        total: pendingOrder.total,
        status: "completed",
        items: pendingOrder.items,
      });
      const savedOrder = { ...pendingOrder, id: id };
      clearCart();
      setCartSidebarOpen(false);

      // 2. Print Customer Copy
      const content = document.getElementById("receiptContent");
      if (content) {
        content.innerHTML = renderReceiptHTML(savedOrder, "CUSTOMER COPY", products, store);
      }
      window.print();

      await new Promise((r) => setTimeout(r, 1000));

      // 3. Print Counter Copy
      if (content) {
        content.innerHTML = renderReceiptHTML(savedOrder, "COUNTER COPY", products, store);
      }
      window.print();

      showToast("Order Saved and Printed", "success");

      // Reload orders + close modal
      const data = await loadData();
      setOrders(data.orders);
      setCategories(data.categories);
      setOpen(false);
      setPendingOrder(null);
    } catch (e) {
      console.error("Print failed:", e);
      showToast("Failed to save order", "error");
    }
  };

  const handleClose = () => {
    setOpen(false);
    setPendingOrder(null);
  };

  // Render the customer copy in the preview initially.
  useEffect(() => {
    if (open && pendingOrder) {
      const content = document.getElementById("receiptContent");
      if (content) {
        content.innerHTML = renderReceiptHTML(pendingOrder, "CUSTOMER COPY", products, store);
      }
    }
  }, [open, pendingOrder]);

  if (!open || !pendingOrder) return null;

  return (
    <div className="modal active receipt-modal-wrapper" id="receiptModal" onClick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}>
      <div className="modal-content receipt-modal">
        <div className="modal-header receipt-modal-header">
          <h3>Receipt</h3>
          <button type="button" className="modal-close" id="closeReceiptModal" onClick={handleClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="receipt-content" id="receiptContent" ref={printRef} />
        <div className="modal-actions receipt-modal-actions">
          <button type="button" className="btn-secondary" id="closeReceipt" onClick={handleClose}>
            <i className="fas fa-times"></i> Close
          </button>
          <button type="button" className="btn-primary" id="printReceipt" onClick={handlePrint}>
            <i className="fas fa-print"></i> Print Receipt
          </button>
        </div>
      </div>
    </div>
  );
}
