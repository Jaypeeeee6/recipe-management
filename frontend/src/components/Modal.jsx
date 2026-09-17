import { useEffect } from "react";
import { createPortal } from "react-dom";

export default function Modal({ title, description, children, onClose, actions, wide }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className={`modal-card${wide ? " modal-wide" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || description) && (
          <div className="modal-title-row">
            <div>
              {title && <h3>{title}</h3>}
              {description && <p className="hint">{description}</p>}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        )}
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  );
}
