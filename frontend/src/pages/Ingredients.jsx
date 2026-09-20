import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";
import Modal from "../components/Modal";
import Icon, { IconAction } from "../components/Icon";
import Skeleton from "../components/Skeleton";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatMoney } from "../utils/format";
import { exportIngredientsPdf } from "../utils/ingredientExport";
import { canWrite } from "../utils/roles";
import { useAuth } from "../auth/AuthContext";

function canApproveIngredient(item) {
  return item.is_trial && item.trial_status !== "approved";
}

function canRejectIngredient(item) {
  return !item.is_trial || item.trial_status === "testing";
}

export default function Ingredients() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [params, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") === "trial" ? "trial" : "approved");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState("table");
  const [q, setQ] = useState(params.get("q") || "");
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("taste");
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(true);
  const [flashId, setFlashId] = useState("");
  const [flashPhase, setFlashPhase] = useState("off"); // on | fading | off
  const highlightParam = params.get("highlight");

  const load = (activeTab = tab) => {
    const query = new URLSearchParams({ tab: activeTab });
    if (category) query.set("category", category);
    if (supplier) query.set("supplier", supplier);
    if (status) query.set("status", status);
    if (q) query.set("search", q);
    api.get(`/ingredients/?${query}`).then((res) => setItems(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    api.get("/categories/").then((r) => setCategories(r.data));
    api.get("/suppliers/").then((r) => setSuppliers(r.data));
  }, []);

  useEffect(() => {
    const urlTab = params.get("tab") === "trial" ? "trial" : "approved";
    setTab((prev) => (prev === urlTab ? prev : urlTab));
  }, [params]);

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
  }, [tab, category, supplier, status, q]);

  const flashClass = (id) => {
    if (!flashId || String(id) !== String(flashId) || flashPhase === "off") return undefined;
    return flashPhase === "fading" ? "row-highlight-fade" : "row-highlight";
  };

  const filtered = useMemo(() => items, [items]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const item of filtered) {
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
  }, [filtered, categories]);

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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const approve = async (id) => {
    await api.post(`/ingredients/${id}/approve/`);
    showToast("Ingredient approved.");
    setTab("approved");
    setSearchParams({ tab: "approved" });
    load("approved");
  };

  const reject = async () => {
    await api.post(`/ingredients/${rejecting.id}/reject/`, {
      rejection_reason: reason,
      rejection_notes: notes,
    });
    setRejecting(null);
    setNotes("");
    showToast("Ingredient rejected.");
    setTab("trial");
    setSearchParams({ tab: "trial" });
    load("trial");
  };

  const remove = async (item) => {
    if (!confirm("Are you sure you want to delete this ingredient?")) return;
    await api.delete(`/ingredients/${item.id}/`);
    showToast("Ingredient deleted.");
    load();
  };

  const exportPdf = () => {
    const categoryLabel = category
      ? categories.find((c) => String(c.id) === String(category))?.name
      : "";
    const supplierLabel = supplier
      ? suppliers.find((s) => String(s.id) === String(supplier))?.company_name
      : "";
    const statusLabels = {
      valid: "Valid",
      expiring_soon: "Expiring Soon",
      expired: "Expired",
    };
    try {
      exportIngredientsPdf({
        items: filtered,
        grouped,
        filters: {
          tabLabel: tab === "trial" ? "Pending / Rejected" : "Approved Ingredients",
          search: q.trim(),
          categoryLabel,
          supplierLabel,
          statusLabel: statusLabels[status] || "",
        },
      });
    } catch {
      alert("Could not export ingredients.");
    }
  };

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}
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
          {canWrite(user) && (
            <Link className="btn btn-add" to="/ingredients/new">
              <Icon name="plus" />
              {tab === "trial" ? "Add Trial Product" : "Add Ingredient"}
            </Link>
          )}
        </div>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === "approved" ? "active" : ""}`}
          onClick={() => {
            setTab("approved");
            setSearchParams({ tab: "approved" });
          }}
        >
          Approved Ingredients
        </button>
        <button
          type="button"
          className={`tab ${tab === "trial" ? "active" : ""}`}
          onClick={() => {
            setTab("trial");
            setSearchParams({ tab: "trial" });
          }}
        >
          Pending / Rejected
        </button>
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
          <select className="select" style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="valid">Valid</option>
            <option value="expiring_soon">Expiring Soon</option>
            <option value="expired">Expired</option>
          </select>
          <button className="btn btn-ghost" onClick={() => setView(view === "table" ? "card" : "table")}>
            <Icon name="layout" />
            {view === "table" ? "Card View" : "Table View"}
          </button>
        </div>

        {loading ? <Skeleton count={6} /> : filtered.length === 0 && <div className="empty">{tab === "trial" ? "No trial products yet." : "No ingredients found."}</div>}

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
                    <th>Expiry</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((i) => (
                    <tr
                      key={i.id}
                      data-ingredient-id={i.id}
                      className={flashClass(i.id)}
                    >
                      <td>{i.code}</td>
                      <td>
                        {i.photo ? <img className="thumb" src={i.photo} alt="" /> : null}
                        <Link to={`/ingredients/${i.id}`}>{i.name}</Link>
                        {i.is_secret && <span className="badge badge-gold" style={{ marginLeft: 6 }}>Secret</span>}
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
                      <td>{i.expiry_date || "—"}</td>
                      <td>
                        {i.is_trial ? (
                          <StatusBadge value={i.trial_status} />
                        ) : (
                          <StatusBadge value={i.expiry_status} kind="expiry" />
                        )}
                      </td>
                      {renderActions(i)}
                    </tr>
                  ))}
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
                  {i.photo && <img className="trial-hero-photo" src={i.photo} alt="" style={{ maxHeight: 140, marginBottom: 8 }} />}
                  <div className="hint">{i.code}</div>
                  <h3 style={{ marginTop: 4 }}>{i.name}</h3>
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
                    <StatusBadge
                      value={i.is_trial ? i.trial_status : i.expiry_status}
                      kind={i.is_trial ? "status" : "expiry"}
                    />
                  </div>
                  <Link to={`/ingredients/${i.id}`}>View details</Link>
                  {renderCardActions(i)}
                </div>
              ))}
            </div>
          </section>
        ))}
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
