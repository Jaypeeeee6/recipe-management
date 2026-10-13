import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";

export const DEFAULT_PAGE_SIZE = 10;

function normalizePage(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function pageFromSearchParams(params) {
  return normalizePage(params.get("page") || "1");
}

/** Client-side pagination for already-loaded/filtered lists. */
export function usePagination(items = [], pageSize = DEFAULT_PAGE_SIZE, resetKey = "", initialPage = 1) {
  const [page, setPage] = useState(() => normalizePage(initialPage));
  const prevResetKey = useRef(resetKey);
  const prevPageSize = useRef(pageSize);
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

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
    pageItems,
    total,
    totalPages,
    pageSize,
    from: total === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}

/**
 * Like usePagination, but keeps `page` in the URL and exposes `listReturnTo`
 * for detail/edit Back links (pass as `state={{ returnTo: listReturnTo }}`).
 */
export function usePersistedListPage(items = [], pageSize = DEFAULT_PAGE_SIZE, resetKey = "") {
  const location = useLocation();
  const [params, setSearchParams] = useSearchParams();
  const pagination = usePagination(items, pageSize, resetKey, pageFromSearchParams(params));
  const { page } = pagination;

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const current = next.get("page");
      const desired = page <= 1 ? null : String(page);
      if ((current || null) === desired) return prev;
      if (desired) next.set("page", desired);
      else next.delete("page");
      return next;
    }, { replace: true });
  }, [page, setSearchParams]);

  const listReturnTo = useMemo(() => {
    const next = new URLSearchParams(location.search);
    if (page <= 1) next.delete("page");
    else next.set("page", String(page));
    const qs = next.toString();
    return qs ? `${location.pathname}?${qs}` : location.pathname;
  }, [location.pathname, location.search, page]);

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
}) {
  if (totalPages <= 1) return null;

  const pages = [];
  const window = 2;
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || (i >= page - window && i <= page + window)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  return (
    <div className="pagination">
      <div className="pagination-meta">
        {total > 0 ? `Showing ${from}–${to} of ${total}` : "No results"}
      </div>
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
  );
}
