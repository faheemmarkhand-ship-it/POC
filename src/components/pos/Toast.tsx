"use client";

import { useEffect, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let pushExternal: ((message: string, type?: ToastType) => void) | null = null;

export function showToast(message: string, type: ToastType = "success") {
  if (pushExternal) pushExternal(message, type);
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
    pushExternal = push;
    return () => {
      pushExternal = null;
    };
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
