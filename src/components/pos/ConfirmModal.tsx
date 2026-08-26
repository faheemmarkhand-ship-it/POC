"use client";

import { useEffect, useState, useCallback } from "react";

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
}

let showExternal: ((opts: ConfirmOptions) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions) {
  if (showExternal) showExternal(opts);
}

export function ConfirmModal() {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [hiding, setHiding] = useState(false);

  const close = useCallback(() => {
    setHiding(true);
    setTimeout(() => {
      setOpts(null);
      setHiding(false);
    }, 200);
  }, []);

  useEffect(() => {
    showExternal = (o) => {
      setHiding(false);
      setOpts(o);
    };
    return () => {
      showExternal = null;
    };
  }, []);

  if (!opts) return null;

  return (
    <div className={`modal confirm-modal active ${hiding ? "hiding" : ""}`} id="confirmModal">
      <div className="modal-content confirm-modal-content">
        <div className="confirm-modal-header">
          <i className="fas fa-question-circle"></i>
          <h2 id="confirmModalTitle">{opts.title || "Are you sure?"}</h2>
        </div>
        <div className="confirm-modal-body">
          <p id="confirmModalMessage">{opts.message}</p>
        </div>
        <div className="modal-actions">
          <button
            type="button"
            className="btn-secondary"
            id="confirmModalCancel"
            onClick={close}
          >
            {opts.cancelText || "No, Cancel"}
          </button>
          <button
            type="button"
            className="btn-primary"
            id="confirmModalConfirm"
            onClick={() => {
              close();
              setTimeout(() => opts.onConfirm(), 200);
            }}
          >
            {opts.confirmText || "Yes, Proceed"}
          </button>
        </div>
      </div>
    </div>
  );
}
