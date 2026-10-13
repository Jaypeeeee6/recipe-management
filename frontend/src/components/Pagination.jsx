import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50];

function normalizePage(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function normalizePageSize(value, fallback = DEFAULT_PAGE_SIZE) {
  const n = Number.parseInt(value, 10);
  return PAGE_SIZE_OPTIONS.includes(n) ? n : fallback;
}

export function pageFromSearchParams(params) {
  return normalizePage(params.get("page") || "1");
}

export function pageSizeFromSearchParams(params, fallback = DEFAULT_PAGE_SIZE) {
  return normalizePageSize(params.get("perPage"), fallback);
}

/** Client-side pagination for already-loaded/filtered lists. */
export function usePagination(items = [], initialPageSize = DEFAULT_PAGE_SIZE, resetKey = "", initialPage = 1) {
  const [page, setPage] = useState(() => normalizePage(initialPage));
  const [pageSize, setPageSizeState] = useState(() => normalizePageSize(initialPageSize));
  const prevResetKey = useRef(resetKey);
  const prevPageSize = useRef(pageSize);
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  const setPageSize = (size) => {
    const next = normalizePageSize(size);
    if (next === pageSize) return;
    setPageSizeState(next);
    setPage(1);
  };

  // Reset to page 1 when filters/size change — not on the initial mount.
  useEffect(() => {
    if (prevResetKey.current === resetKey && prevPageSize.current === pageSize) return;
    prevResetKey.current = resetKey;
    prevPageSize.current = pageSize;
    setPage(1);
  }, [resetKey, pageSize]);

  // Don't clamp while the list is empty (e.g. still loading) — that would
  // wipe a restored page number from the URL before data arrives.
  useEffect(() => {
    if (total === 0) return;
    if (page > totalPages) setPage(totalPages);
  }, [page, total, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize]);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    pageItems,
    total,
    totalPages,
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}

/**
 * Like usePagination, but keeps `page` / `perPage` in the URL and exposes
 * `listReturnTo` for detail/edit Back links.
 */
export function usePersistedListPage(items = [], initialPageSize = DEFAULT_PAGE_SIZE, resetKey = "") {
  const location = useLocation();
  const [params, setSearchParams] = useSearchParams();
  const pagination = usePagination(
    items,
    pageSizeFromSearchParams(params, initialPageSize),
    resetKey,
    pageFromSearchParams(params)
  );
  const { page, pageSize } = pagination;

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      let changed = false;

      const currentPage = next.get("page");
      const desiredPage = page <= 1 ? null : String(page);
      if ((currentPage || null) !== desiredPage) {
        if (desiredPage) next.set("page", desiredPage);
        else next.delete("page");
        changed = true;
      }

      const currentSize = next.get("perPage");
      const desiredSize = pageSize === DEFAULT_PAGE_SIZE ? null : String(pageSize);
      if ((currentSize || null) !== desiredSize) {
        if (desiredSize) next.set("perPage", desiredSize);
        else next.delete("perPage");
        changed = true;
      }

      return changed ? next : prev;
    }, { replace: true });
  }, [page, pageSize, setSearchParams]);

  const listReturnTo = useMemo(() => {
    const next = new URLSearchParams(location.search);
    if (page <= 1) next.delete("page");
    else next.set("page", String(page));
    if (pageSize === DEFAULT_PAGE_SIZE) next.delete("perPage");
    else next.set("perPage", String(pageSize));
    const qs = next.toString();
    return qs ? `${location.pathname}?${qs}` : location.pathname;
  }, [location.pathname, location.search, page, pageSize]);

  return { ...pagination, listReturnTo };
}

/** Read `location.state.returnTo` from a list link, with a fallback path. */
export function useReturnTo(fallback) {
  const location = useLocation();
  return location.state?.returnTo || fallback;
}

export default function Pagination({
  page,
  totalPages,
  onChange,
  total = 0,
  from = 0,
  to = 0,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageSizeChange,
}) {
  if (total <= 0) return null;

  const pages = [];
  const windowSize = 2;
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || (i >= page - windowSize && i <= page + windowSize)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="table-footer">
      <div className="table-footer-left">
        {typeof onPageSizeChange === "function" && (
          <label className="show-label">
            Show
            <select
              className="page-size"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Results per page"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}
        <span className="entries-info">
          {total > 0
            ? `Showing ${from} to ${to} of ${total} entries`
            : "Showing 0 entries"}
        </span>
      </div>
      {totalPages > 1 && (
        <div className="table-footer-right">
          <div className="pagination-controls">
            <button
              type="button"
              className="pagination-btn"
              disabled={page <= 1}
              onClick={() => onChange(page - 1)}
              aria-label="Previous page"
            >
              Prev
            </button>
            {pages.map((p, idx) =>
              p === "…" ? (
                <span key={`e-${idx}`} className="pagination-ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  className={`pagination-btn${p === page ? " active" : ""}`}
                  onClick={() => onChange(p)}
                  aria-current={p === page ? "page" : undefined}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              className="pagination-btn"
              disabled={page >= totalPages}
              onClick={() => onChange(page + 1)}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
