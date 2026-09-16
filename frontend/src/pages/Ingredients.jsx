import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import { formatDate, formatMoney } from "../utils/format";
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

  const load = (activeTab = tab) => {
    const query = new URLSearchParams({ tab: activeTab });
    if (category) query.set("category", category);
    if (supplier) query.set("supplier", supplier);
    if (status) query.set("status", status);
    if (q) query.set("search", q);
    api.get(`/ingredients/?${query}`).then((res) => setItems(res.data));
  };

  useEffect(() => {
    api.get("/categories/").then((r) => setCategories(r.data));
    api.get("/suppliers/").then((r) => setSuppliers(r.data));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(), q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [tab, category, supplier, status, q]);

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
      <Link className="btn btn-ghost" to={`/ingredients/${i.id}`}>View</Link>
      {canApproveIngredient(i) && (
        <button className="btn btn-primary" onClick={() => approve(i.id)}>Approve</button>
      )}
      {canRejectIngredient(i) && (
        <button className="btn btn-danger" onClick={() => setRejecting(i)}>Reject</button>
      )}
      <button className="icon-btn" onClick={() => remove(i)} title="Delete">✕</button>
    </td>
  );

  const renderCardActions = (i) => (
    <div className="row-actions" style={{ marginTop: 12 }}>
      <Link className="btn btn-ghost" to={`/ingredients/${i.id}`}>View</Link>
      {canApproveIngredient(i) && (
        <button className="btn btn-primary" onClick={() => approve(i.id)}>Approve</button>
      )}
      {canRejectIngredient(i) && (
        <button className="btn btn-danger" onClick={() => setRejecting(i)}>Reject</button>
      )}
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

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}
      <div className="page-header">
        <div>
          <h1>Ingredients</h1>
          <p>Review trial products, then approve or reject for production use</p>
        </div>
        <div className="page-header-actions">
          {canWrite(user) && (
            <Link className="btn btn-primary" to="/ingredients/new">
              {tab === "trial" ? "Add Trial Product" : "Add Ingredient"}
            </Link>
          )}
        </div>
      </div>

      <div className="card">
        <div className="tabs">
          <button
            className={`tab ${tab === "approved" ? "active" : ""}`}
            onClick={() => {
              setTab("approved");
              setSearchParams({ tab: "approved" });
            }}
          >
            Approved Ingredients
          </button>
          <button
            className={`tab ${tab === "trial" ? "active" : ""}`}
            onClick={() => {
              setTab("trial");
              setSearchParams({ tab: "trial" });
            }}
          >
            Pending / Rejected
          </button>
        </div>
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
            {view === "table" ? "Card View" : "Table View"}
          </button>
        </div>

        {filtered.length === 0 && <div className="empty">{tab === "trial" ? "No trial products yet." : "No ingredients found."}</div>}

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
                    <tr key={i.id}>
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
                <div className="card card-pad" key={i.id}>
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
              <button className="btn btn-danger" onClick={reject}>Reject</button>
            </>
          }
        >
          <p>Reason for rejecting {rejecting.name}</p>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Reason</label>
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
