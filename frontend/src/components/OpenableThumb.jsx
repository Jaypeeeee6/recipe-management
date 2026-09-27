import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Table thumb that opens a full-size lightbox (inventory item master pattern). */
export default function OpenableThumb({ src, alt = "", className = "thumb" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!src) return null;

  return (
    <>
      <img
        className={`${className} thumb-openable`.trim()}
        src={src}
        alt={alt}
        title="Click to enlarge"
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
      />
      {open &&
        createPortal(
          <div
            className="image-lightbox is-open"
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged image"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <button
              type="button"
              className="lightbox-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              &times;
            </button>
            <img className="lightbox-image" src={src} alt={alt || "Enlarged image"} />
          </div>,
          document.body
        )}
    </>
  );
}
