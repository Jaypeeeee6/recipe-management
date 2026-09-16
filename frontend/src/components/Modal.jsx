export default function Modal({ title, children, onClose, actions, wide }) {
  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card"
        style={wide ? { maxWidth: 860 } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h3>{title}</h3>}
        {children}
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}
