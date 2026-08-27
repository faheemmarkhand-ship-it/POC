"use client";

import { useEffect, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

// Global toast event system — survives Fast Refresh
const TOAST_EVENT = "pos-show-toast";

export function showToast(message: string, type: ToastType = "success") {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, type } }));
  }
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, type: ToastType = "success") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        push(detail.message, detail.type || "success");
      }
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, [push]);

  return (
    <div id="toastContainer">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <i
            className={`fas fa-${
              t.type === "success"
                ? "check-circle"
                : t.type === "error"
                ? "exclamation-circle"
                : "info-circle"
            }`}
          ></i>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
