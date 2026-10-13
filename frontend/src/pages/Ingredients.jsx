import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";
import Modal from "../components/Modal";
import Icon, { IconAction } from "../components/Icon";
import Pagination, { usePersistedListPage } from "../components/Pagination";
import Skeleton from "../components/Skeleton";
import StatusBadge from "../components/StatusBadge";
import SecretBadge from "../components/SecretBadge";
import OpenableThumb from "../components/OpenableThumb";
import { formatDate, formatMoney } from "../utils/format";
import { exportIngredientsPdf } from "../utils/ingredientExport";
import { canManageLabSettings, canWrite } from "../utils/roles";
import { useAuth } from "../auth/AuthContext";
import { apiErrorMessage, useDialogs } from "../dialogs/DialogsContext";

function canApproveIngredient(item) {
  return item.is_trial && item.trial_status !== "approved";
}

function canRejectIngredient(item) {
  return !item.is_trial || item.trial_status === "testing";
}

const INGREDIENT_TABS = ["pending", "rejected", "approved", "secret"];

const TAB_LABELS = {
  pending: "Pending",
  rejected: "Rejected",
  approved: "Approved",
  secret: "Secret",
};

const SORT_OPTIONS = [
  { value: "name-asc", label: "Name (A–Z)" },
  { value: "name-desc", label: "Name (Z–A)" },
  { value: "code-asc", label: "Code (A–Z)" },
  { value: "code-desc", label: "Code (Z–A)" },
  { value: "price-asc", label: "Price (Low–High)" },
  { value: "price-desc", label: "Price (High–Low)" },
  { value: "date-desc", label: "Date Added (Newest)" },
  { value: "date-asc", label: "Date Added (Oldest)" },
];

function normalizeTab(value) {
  if (value === "trial") return "pending"; // legacy URL
  if (value === "reject") return "rejected";
  return INGREDIENT_TABS.includes(value) ? value : "approved";
}

function normalizeSort(value) {
  if (!value) return "";
  return SORT_OPTIONS.some((o) => o.value === value) ? value : "";
}

function compareIngredients(a, b, sort) {
  const [field, dir] = sort.split("-");
  const mult = dir === "desc" ? -1 : 1;

  if (field === "price") {
    const aMissing = a.price_per_unit == null || a.price_per_unit === "";
    const bMissing = b.price_per_unit == null || b.price_per_unit === "";
    if (aMissing && bMissing) return 0;
    if (aMissing) return 1;
    if (bMissing) return -1;
    const av = Number(a.price_per_unit) || 0;
    const bv = Number(b.price_per_unit) || 0;
    return av === bv ? 0 : (av < bv ? -1 : 1) * mult;
  }

  let av;
  let bv;
  if (field === "code") {
    av = (a.code || "").toLowerCase();
    bv = (b.code || "").toLowerCase();
  } else if (field === "date") {
    av = a.created_at ? Date.parse(a.created_at) : 0;
    bv = b.created_at ? Date.parse(b.created_at) : 0;
    if (!Number.isFinite(av)) av = 0;
    if (!Number.isFinite(bv)) bv = 0;
  } else {
    av = (a.name || "").toLowerCase();
    bv = (b.name || "").toLowerCase();
  }
  if (av < bv) return -1 * mult;
  if (av > bv) return 1 * mult;
  return 0;
}

function groupIngredientsByCategory(list, categories) {
  const map = new Map();
  for (const item of list) {
    const key = item.category_name || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  const order = categories.map((c) => c.name);
  const names = [...map.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
  return names.map((name) => ({ name, items: map.get(name) }));
}

export default function Ingredients() {
  const { user } = useAuth();
  const { showSuccess, showError, confirm, confirmDelete } = useDialogs();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [params, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(normalizeTab(params.get("tab")));
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [sort, setSort] = useState(normalizeSort(params.get("sort")));
  const [view, setView] = useState("table");
  const [q, setQ] = useState(params.get("q") || "");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("taste");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [flashId, setFlashId] = useState("");
  const [flashPhase, setFlashPhase] = useState("off"); // on | fading | off
  const highlightParam = params.get("highlight");
  const fileInputRef = useRef(null);

  const load = (activeTab = tab) => {
    const query = new URLSearchParams({ tab: activeTab });
    if (category) query.set("category", category);
    if (supplier) query.set("supplier", supplier);
    if (q) query.set("search", q);
    api.get(`/ingredients/?${query}`).then((res) => setItems(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get("/categories/").then((r) => setCategories(r.data));
    api.get("/suppliers/").then((r) => setSuppliers(r.data));
  }, []);

  useEffect(() => {
    const urlTab = normalizeTab(params.get("tab"));
    setTab((prev) => (prev === urlTab ? prev : urlTab));
    const urlSort = normalizeSort(params.get("sort"));
    setSort((prev) => (prev === urlSort ? prev : urlSort));
  }, [params]);

  // Keep sort in the URL so Back restores it with the current page.
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const current = next.get("sort");
      const desired = sort || null;
      if ((current || null) === desired) return prev;
      if (desired) next.set("sort", desired);
      else next.delete("sort");
      return next;
    }, { replace: true });
  }, [sort, setSearchParams]);

  // Capture highlight once from the URL, then strip it so re-renders don't re-trigger.
  useEffect(() => {
    if (!highlightParam) return;
    setFlashId(String(highlightParam));
    setFlashPhase("on");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!next.has("highlight")) return prev;
      next.delete("highlight");
      return next;
    }, { replace: true });
  }, [highlightParam, setSearchParams]);

  useEffect(() => {
    if (!flashId) return undefined;
    const fadeTimer = setTimeout(() => setFlashPhase("fading"), 1400);
    const clearTimer = setTimeout(() => {
      setFlashId("");
      setFlashPhase("off");
    }, 2800);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(clearTimer);
    };
  }, [flashId]);

  useEffect(() => {
    if (!flashId || loading || flashPhase !== "on") return undefined;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-ingredient-id="${CSS.escape(String(flashId))}"]`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
    return () => clearTimeout(timer);
  }, [flashId, loading, flashPhase, items]);

  useEffect(() => {
    const timer = setTimeout(() => load(), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [tab, category, supplier, q]);

  const flashClass = (id) => {
    if (!flashId || String(id) !== String(flashId) || flashPhase === "off") return undefined;
    return flashPhase === "fading" ? "row-highlight-fade" : "row-highlight";
  };

  // Group by category first, then sort within each category, then flatten.
  // That way pagination walks whole categories instead of mixing a few rows
  // from every category onto each page.
  const categorySections = useMemo(() => {
    return groupIngredientsByCategory(items, categories).map((section) => ({
      name: section.name,
      items: sort
        ? [...section.items].sort((a, b) => compareIngredients(a, b, sort))
        : section.items,
    }));
  }, [items, categories, sort]);

  const filtered = useMemo(
    () => categorySections.flatMap((section) => section.items),
    [categorySections]
  );

  const {
    page, setPage, pageSize, setPageSize, pageItems, total, totalPages, from, to, listReturnTo,
  } = usePersistedListPage(
    filtered,
    10,
    `${tab}|${category}|${supplier}|${q}|${sort}`
  );

  const grouped = useMemo(
    () => groupIngredientsByCategory(pageItems, categories),
    [pageItems, categories]
  );

  const exportGrouped = categorySections;

  const renderActions = (i) => (
    <td className="row-actions">
      {canApproveIngredient(i) && (
        <IconAction name="check" title="Approve" tone="ok" onClick={() => approve(i.id)} />
      )}
      {canRejectIngredient(i) && (
        <IconAction name="reject" title="Reject" tone="danger" onClick={() => setRejecting(i)} />
      )}
      <IconAction name="trash" title="Delete" tone="danger" onClick={() => remove(i)} />
    </td>
  );

  const renderCardActions = (i) => (
    <div className="row-actions" style={{ marginTop: 12 }}>
      {canApproveIngredient(i) && (
        <IconAction name="check" title="Approve" tone="ok" onClick={() => approve(i.id)} />
      )}
      {canRejectIngredient(i) && (
        <IconAction name="reject" title="Reject" tone="danger" onClick={() => setRejecting(i)} />
      )}
      <IconAction name="trash" title="Delete" tone="danger" onClick={() => remove(i)} />
    </div>
  );

  const approve = async (id) => {
    try {
      await api.post(`/ingredients/${id}/approve/`);
      showSuccess("Ingredient approved.");
      const nextTab = items.find((item) => item.id === id)?.is_secret ? "secret" : "approved";
      setTab(nextTab);
      setSearchParams({ tab: nextTab });
      load(nextTab);
    } catch (err) {
      showError(apiErrorMessage(err, "Could not approve ingredient."));
    }
  };

  const reject = async () => {
    try {
      await api.post(`/ingredients/${rejecting.id}/reject/`, {
        rejection_reason: reason,
        rejection_notes: notes,
      });
      setRejecting(null);
      setNotes("");
      showSuccess("Ingredient rejected.");
      const nextTab = rejecting.is_secret ? "secret" : "rejected";
      setTab(nextTab);
      setSearchParams({ tab: nextTab });
      load(nextTab);
    } catch (err) {
      showError(apiErrorMessage(err, "Could not reject ingredient."));
    }
  };

  const remove = async (item) => {
    const ok = await confirmDelete("Are you sure you want to delete this ingredient?");
    if (!ok) return;
    try {
      await api.delete(`/ingredients/${item.id}/`);
      showSuccess("Ingredient deleted.");
      load();
    } catch (err) {
      showError(apiErrorMessage(err, "Could not delete ingredient."));
    }
  };

  const exportPdf = async () => {
    const categoryLabel = category
      ? categories.find((c) => String(c.id) === String(category))?.name
      : "";
    const supplierLabel = supplier
      ? suppliers.find((s) => String(s.id) === String(supplier))?.company_name
      : "";
    const sortLabel = sort
      ? SORT_OPTIONS.find((o) => o.value === sort)?.label || ""
      : "";
    try {
      await exportIngredientsPdf({
        items: filtered,
        grouped: exportGrouped,
        filters: {
          tabLabel: `${TAB_LABELS[tab] || tab} Ingredients`,
          search: q.trim(),
          categoryLabel,
          supplierLabel,
          sortLabel,
        },
      });
    } catch (err) {
      showError(err?.message || "Could not export ingredients.");
    }
  };

  const deleteAllIngredients = async () => {
    const ok = await confirmDelete(
      "This will permanently delete ALL ingredients (including secret and trial). Recipe lines will lose their linked ingredient. This cannot be undone.",
      "Delete all ingredients?"
    );
    if (!ok) return;
    const confirmed = await confirm({
      title: "Final confirmation",
      message: 'Click "Delete all" to permanently remove every ingredient.',
      confirmText: "Delete all",
      confirmClass: "modal-confirm-btn-reject",
    });
    if (!confirmed) return;
    try {
      const { data } = await api.post("/ingredients/delete-all/", { confirm: "DELETE" });
      showSuccess(`Deleted ${data.deleted} ingredient(s).`);
      load();
    } catch (err) {
      showError(apiErrorMessage(err, "Could not delete all ingredients."));
    }
  };

  const downloadImportTemplate = async () => {
    try {
      const { data } = await api.get("/ingredients/import-template/", { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "ingredient_import_template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showError(apiErrorMessage(err, "Could not download import template."));
    }
  };

  const onImportExcel = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const { data } = await api.post("/ingredients/import-excel/", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const errCount = data.errors?.length || 0;
      const suppliersCreated = data.suppliers_created || 0;
      const dupCount = data.duplicates || 0;
      const supplierNote = suppliersCreated
        ? ` ${suppliersCreated} new supplier(s) created.`
        : "";
      const dupNote = dupCount
        ? ` ${dupCount} duplicate(s) skipped.`
        : "";
      if (data.created) {
        showSuccess(
          errCount
            ? `Imported ${data.created} ingredient(s).${supplierNote}${dupNote} ${errCount} row(s) had errors.`
            : `Imported ${data.created} ingredient(s).${supplierNote}${dupNote}`
        );
        load();
      } else if (dupCount && !errCount) {
        showSuccess(`No new ingredients. ${dupCount} duplicate(s) skipped.`);
        load();
      } else if (errCount) {
        const first = data.errors[0];
        showError(
          `Import failed. Row ${first.row}: ${first.message}` +
            (errCount > 1 ? ` (+${errCount - 1} more)` : "")
        );
      } else {
        showError("No ingredients were imported.");
      }
    } catch (err) {
      const payload = err?.response?.data;
      if (payload?.errors?.length) {
        const first = payload.errors[0];
        showError(`Import failed. Row ${first.row}: ${first.message}`);
      } else {
        showError(apiErrorMessage(err, "Could not import Excel file."));
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Ingredients</h1>
          <p>Review trial products, then approve or reject for production use</p>
        </div>
        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-gold"
            onClick={exportPdf}
            disabled={loading || filtered.length === 0}
          >
            <Icon name="download" />
            Export PDF
          </button>
          {canManageLabSettings(user) && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={deleteAllIngredients}
              disabled={loading || importing}
              style={{ color: "var(--danger, #b42318)" }}
            >
              <Icon name="trash" />
              Delete all
            </button>
          )}
          {canWrite(user) && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={downloadImportTemplate}
                disabled={importing}
              >
                <Icon name="download" />
                Excel template
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                <Icon name="plus" />
                {importing ? "Importing…" : "Import Excel"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hidden
                onChange={onImportExcel}
              />
              <Link className="btn btn-add" to="/ingredients/new" state={{ returnTo: listReturnTo }}>
                <Icon name="plus" />
                {tab === "pending" || tab === "rejected" ? "Add Trial Product" : "Add Ingredient"}
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="tabs">
        {INGREDIENT_TABS.map((key) => (
          <button
            key={key}
            type="button"
            className={`tab ${tab === key ? "active" : ""}`}
            onClick={() => {
              setTab(key);
              setSearchParams((prev) => {
                const next = new URLSearchParams();
                next.set("tab", key);
                const s = prev.get("sort");
                if (s) next.set("sort", s);
                return next;
              });
            }}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-4.3-4.3M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input
              placeholder="Search name, code, or batch/lot…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </div>
          <select className="select" style={{ width: 160 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="select" style={{ width: 180 }} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
          </select>
          <select
            className="select"
            style={{ width: 200 }}
            value={sort}
            onChange={(e) => setSort(normalizeSort(e.target.value))}
            aria-label="Sort by"
          >
            <option value="">Sort by</option>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            className="btn btn-ghost"
            style={{ marginLeft: "auto" }}
            onClick={() => setView(view === "table" ? "card" : "table")}
          >
            <Icon name="layout" />
            {view === "table" ? "Card View" : "Table View"}
          </button>
        </div>

        {loading ? <Skeleton count={6} /> : filtered.length === 0 && (
          <div className="empty">
            {tab === "pending"
              ? "No pending ingredients."
              : tab === "rejected"
                ? "No rejected ingredients."
                : tab === "secret"
                  ? "No secret ingredients."
                  : "No approved ingredients found."}
          </div>
        )}

        {view === "table" && filtered.length > 0 && grouped.map((section) => (
          <section key={section.name} className="ingredient-section">
            <div className="ingredient-section-header">
              <h3>{section.name}</h3>
              <span className="hint">{section.items.length} item{section.items.length === 1 ? "" : "s"}</span>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Supplier</th>
                    <th>Batch / Lot</th>
                    <th>Qty</th>
                    <th>Price / Unit</th>
                    <th>Date Added</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((i) => {
                    const highlight = flashClass(i.id);
                    return (
                    <tr
                      key={i.id}
                      data-ingredient-id={i.id}
                      className={highlight || undefined}
                    >
                      <td>{i.code}</td>
                      <td>
                        {i.photo ? <OpenableThumb src={i.photo} alt={i.name || ""} /> : null}
                        <Link to={`/ingredients/${i.id}`} state={{ returnTo: listReturnTo }}>{i.name}</Link>
                        {i.is_secret && <SecretBadge className="badge-secret-inline" />}
                        {i.is_low_stock && <span className="badge badge-low" style={{ marginLeft: 6 }}>Low Stock</span>}
                      </td>
                      <td>{i.supplier_name || "—"}</td>
                      <td>{i.batch_number || "—"}</td>
                      <td>{i.quantity} {i.unit}</td>
                      <td>
                        {i.price_per_unit != null && i.price_per_unit !== ""
                          ? <>{formatMoney(i.price_per_unit)}{i.unit ? <span className="hint"> / {i.unit}</span> : null}</>
                          : "—"}
                      </td>
                      <td>{i.created_at ? formatDate(i.created_at) : "—"}</td>
                      <td>
                        {i.is_trial ? (
                          <StatusBadge value={i.trial_status} />
                        ) : (
                          <StatusBadge value="approved" />
                        )}
                      </td>
                      {renderActions(i)}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        {view === "card" && filtered.length > 0 && grouped.map((section) => (
          <section key={section.name} className="ingredient-section">
            <div className="ingredient-section-header">
              <h3>{section.name}</h3>
              <span className="hint">{section.items.length} item{section.items.length === 1 ? "" : "s"}</span>
            </div>
            <div className="stats-grid ingredient-section-grid">
              {section.items.map((i) => (
                <div
                  className={`card card-pad${flashClass(i.id) ? ` ${flashClass(i.id)}` : ""}`}
                  key={i.id}
                  data-ingredient-id={i.id}
                >
                  {i.photo && (
                    <OpenableThumb
                      src={i.photo}
                      alt={i.name || ""}
                      className="trial-hero-photo"
                    />
                  )}
                  <div className="hint">{i.code}</div>
                  <h3 style={{ marginTop: 4 }}>
                    {i.name}
                    {i.is_secret && <SecretBadge className="badge-secret-inline" />}
                  </h3>
                  <p className="hint">{i.supplier_name || "—"}</p>
                  <p className="hint" style={{ marginTop: 4 }}>
                    Added {i.created_at ? formatDate(i.created_at) : "—"}
                  </p>
                  <p className="hint" style={{ marginTop: 4 }}>
                    {i.price_per_unit != null && i.price_per_unit !== ""
                      ? `${formatMoney(i.price_per_unit)}${i.unit ? ` / ${i.unit}` : ""}`
                      : "No price set"}
                  </p>
                  <div style={{ margin: "8px 0" }}>
                    <StatusBadge value={i.is_trial ? i.trial_status : "approved"} />
                  </div>
                  <Link to={`/ingredients/${i.id}`} state={{ returnTo: listReturnTo }}>View details</Link>
                  {renderCardActions(i)}
                </div>
              ))}
            </div>
          </section>
        ))}

        {filtered.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            onChange={setPage}
            total={total}
            from={from}
            to={to}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>

      {rejecting && (
        <Modal
          title="Rejection Reason"
          onClose={() => setRejecting(null)}
          actions={
            <>
              <button className="btn btn-back" onClick={() => setRejecting(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={reject}><Icon name="reject" /> Reject</button>
            </>
          }
        >
          <p>Reason for rejecting {rejecting.name}</p>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="required">Reason</label>
            <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="taste">Taste</option>
              <option value="price">Price</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Additional Notes</label>
            <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
