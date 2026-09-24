import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DialogsContext = createContext(null);

function ErrorIcon() {
  return (
    <div className="modal-confirm-icon modal-confirm-icon-error" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </div>
  );
}

function useBodyLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

function ErrorDialog({ open, title, message, detail, onClose }) {
  useBodyLock(open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="modal-confirm app-error-modal is-open"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="app-error-title"
      aria-describedby="app-error-lead"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-confirm-card" onClick={(e) => e.stopPropagation()}>
        <ErrorIcon />
        <h3 id="app-error-title" className="modal-confirm-title">{title || "Error"}</h3>
        {message ? (
          <p id="app-error-lead" className="modal-confirm-message">{message}</p>
        ) : null}
        {detail ? (
          <p className="modal-confirm-message modal-confirm-message-secondary">{detail}</p>
        ) : null}
        <div className="modal-confirm-buttons">
          <button type="button" className="modal-confirm-btn modal-confirm-btn-cancel" onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AlertDialog({ open, title, message, variant, onClose }) {
  useBodyLock(open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const okClass =
    variant === "error"
      ? "modal-confirm-btn modal-confirm-btn-confirm modal-confirm-btn-reject"
      : "modal-confirm-btn modal-confirm-btn-confirm modal-confirm-btn-approve";

  return createPortal(
    <div
      className="modal-confirm is-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-alert-title"
      aria-describedby="app-alert-message"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-confirm-card" onClick={(e) => e.stopPropagation()}>
        <h3 id="app-alert-title" className="modal-confirm-title">
          {title || (variant === "error" ? "Error" : variant === "success" ? "Success" : "Notice")}
        </h3>
        {message ? (
          <p id="app-alert-message" className="modal-confirm-message">{message}</p>
        ) : null}
        <div className="modal-confirm-buttons">
          <button type="button" className={okClass} onClick={onClose} autoFocus>
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ConfirmDialog({ open, title, message, cancelText, confirmText, confirmClass, onCancel, onConfirm }) {
  useBodyLock(open);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return createPortal(
    <div
      className="modal-confirm is-open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-confirm-title"
      aria-describedby="app-confirm-message"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal-confirm-card" onClick={(e) => e.stopPropagation()}>
        <h3 id="app-confirm-title" className="modal-confirm-title">{title || "Confirm"}</h3>
        {message ? (
          <p id="app-confirm-message" className="modal-confirm-message">{message}</p>
        ) : null}
        <div className="modal-confirm-buttons">
          <button type="button" className="modal-confirm-btn modal-confirm-btn-cancel" onClick={onCancel}>
            {cancelText || "Cancel"}
          </button>
          <button
            type="button"
            className={`modal-confirm-btn modal-confirm-btn-confirm ${confirmClass || "modal-confirm-btn-approve"}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmText || "Confirm"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export function apiErrorMessage(err, fallback = "Something went wrong.") {
  const detail = err?.response?.data;
  if (typeof detail === "string") return detail;
  if (detail?.detail != null) {
    return Array.isArray(detail.detail) ? detail.detail[0] : String(detail.detail);
  }
  if (detail && typeof detail === "object") {
    const parts = Object.entries(detail).map(
      ([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`
    );
    if (parts.length) return parts.join("; ");
  }
  return fallback;
}

export function DialogsProvider({ children }) {
  const [errorState, setErrorState] = useState({ open: false, title: "Error", message: "", detail: "" });
  const [alertState, setAlertState] = useState({ open: false, title: "", message: "", variant: "success" });
  const [confirmState, setConfirmState] = useState({
    open: false,
    title: "Confirm",
    message: "",
    cancelText: "Cancel",
    confirmText: "Confirm",
    confirmClass: "modal-confirm-btn-approve",
  });
  const confirmResolver = useRef(null);

  const closeError = useCallback(() => {
    setErrorState((s) => ({ ...s, open: false }));
  }, []);

  const closeAlert = useCallback(() => {
    setAlertState((s) => ({ ...s, open: false }));
  }, []);

  const resolveConfirm = useCallback((value) => {
    const resolve = confirmResolver.current;
    confirmResolver.current = null;
    setConfirmState((s) => ({ ...s, open: false }));
    if (resolve) resolve(value);
  }, []);

  const showError = useCallback((messageOrOpts, title) => {
    if (typeof messageOrOpts === "string") {
      setErrorState({
        open: true,
        title: title || "Error",
        message: messageOrOpts || "Something went wrong.",
        detail: "",
      });
      return;
    }
    const opts = messageOrOpts || {};
    setErrorState({
      open: true,
      title: opts.title || title || "Error",
      message: opts.message || opts.lead || opts.error || "Something went wrong.",
      detail: opts.detail || "",
    });
  }, []);

  const showSuccess = useCallback((message, title = "Success") => {
    setAlertState({
      open: true,
      title,
      message: message || "",
      variant: "success",
    });
  }, []);

  const showAlert = useCallback((messageOrOpts, title) => {
    if (typeof messageOrOpts === "string") {
      setAlertState({
        open: true,
        title: title || "Notice",
        message: messageOrOpts,
        variant: "notice",
      });
      return;
    }
    const opts = messageOrOpts || {};
    setAlertState({
      open: true,
      title: opts.title || title || (opts.variant === "error" ? "Error" : opts.variant === "success" ? "Success" : "Notice"),
      message: opts.message || "",
      variant: opts.variant || "notice",
    });
  }, []);

  const confirm = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      confirmResolver.current = resolve;
      setConfirmState({
        open: true,
        title: opts.title || "Confirm",
        message: opts.message || "Are you sure?",
        cancelText: opts.cancelText || "Cancel",
        confirmText: opts.confirmText || "Confirm",
        confirmClass: opts.confirmClass || "modal-confirm-btn-approve",
      });
    });
  }, []);

  const confirmDelete = useCallback((message, title = "Confirm delete") => {
    return confirm({
      title,
      message,
      confirmText: "Delete",
      confirmClass: "modal-confirm-btn-reject",
    });
  }, [confirm]);

  const value = useMemo(
    () => ({
      showError,
      showSuccess,
      showAlert,
      confirm,
      confirmDelete,
      apiErrorMessage,
    }),
    [showError, showSuccess, showAlert, confirm, confirmDelete]
  );

  return (
    <DialogsContext.Provider value={value}>
      {children}
      <ErrorDialog
        open={errorState.open}
        title={errorState.title}
        message={errorState.message}
        detail={errorState.detail}
        onClose={closeError}
      />
      <AlertDialog
        open={alertState.open}
        title={alertState.title}
        message={alertState.message}
        variant={alertState.variant}
        onClose={closeAlert}
      />
      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        cancelText={confirmState.cancelText}
        confirmText={confirmState.confirmText}
        confirmClass={confirmState.confirmClass}
        onCancel={() => resolveConfirm(false)}
        onConfirm={() => resolveConfirm(true)}
      />
    </DialogsContext.Provider>
  );
}

export function useDialogs() {
  const ctx = useContext(DialogsContext);
  if (!ctx) {
    throw new Error("useDialogs must be used within DialogsProvider");
  }
  return ctx;
}
