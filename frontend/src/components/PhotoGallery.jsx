import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

/** Horizontal photo cards with click-to-enlarge lightbox (inventory item detail pattern). */
export default function PhotoGallery({ photos = [], alt = "Photo" }) {
  const items = useMemo(() => {
    const seen = new Set();
    return photos.filter((src) => {
      if (!src || seen.has(src)) return false;
      seen.add(src);
      return true;
    });
  }, [photos]);

  const [openSrc, setOpenSrc] = useState(null);

  useEffect(() => {
    if (!openSrc) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpenSrc(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [openSrc]);

  if (!items.length) return null;

  return (
    <div className="photo-gallery">
      <div className="photo-gallery-title">Photos</div>
      <div className="photo-gallery-row">
        {items.map((src) => (
          <button
            key={src}
            type="button"
            className="photo-gallery-card"
            title="Click to enlarge"
            onClick={() => setOpenSrc(src)}
          >
            <img src={src} alt={alt} />
          </button>
        ))}
      </div>
      {openSrc &&
        createPortal(
          <div
            className="image-lightbox is-open"
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged image"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpenSrc(null);
            }}
          >
            <button
              type="button"
              className="lightbox-close"
              aria-label="Close"
              onClick={() => setOpenSrc(null)}
            >
              &times;
            </button>
            <img className="lightbox-image" src={openSrc} alt={alt} />
          </div>,
          document.body
        )}
    </div>
  );
}
