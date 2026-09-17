import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import Icon, { IconAction } from "../components/Icon";
import Skeleton from "../components/Skeleton";
import StatusBadge from "../components/StatusBadge";
import Stars from "../components/Stars";
import { formatDate, formatDateTime, formatExpiryUnit, formatMoney } from "../utils/format";
import { exportProductPdf } from "../utils/productExport";

function ProductTabs() {
  return (
    <div className="tabs">
      <NavLink
        to="/products"
        end
        className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
      >
        Products
      </NavLink>
      <NavLink
        to="/products/archives"
        className={({ isActive }) => `tab ${isActive ? "active" : ""}`}
      >
        Archives
      </NavLink>
    </div>
  );
}

export function ProductList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/evaluations/").then((r) => setItems(r.data)).finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const remove = async (p) => {
    if (!confirm("Delete this product?")) return;
    await api.delete(`/evaluations/${p.id}/`);
    load();
  };

  const exportPdf = async (p) => {
    try {
      await exportProductPdf(p);
    } catch {
      alert("Could not export this product.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p>Approved meal trials sync here automatically, or add products manually</p>
        </div>
        <Link className="btn btn-add" to="/products/new"><Icon name="plus" /> Add Product</Link>
      </div>

      <div className="card">
        <ProductTabs />
        {loading ? (
          <div className="card-pad"><Skeleton count={6} /></div>
        ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Product</th>
                <th>Selling Price</th>
                <th>Approved Trials</th>
                <th>Ingredients</th>
                <th>Avg Success</th>
                <th>Avg Rating</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan="8">
                    <div className="empty">
                      No products yet. Approve a meal trial or add a product manually.
                    </div>
                  </td>
                </tr>
              )}
              {items.map((p) => (
                <tr key={p.id}>
                  <td><Link to={`/products/${p.id}`}>{p.product_name}</Link></td>
                  <td>{p.selling_price != null ? formatMoney(p.selling_price) : "—"}</td>
                  <td>
                    {(p.trial_titles || []).length === 0 && "—"}
                    {(p.trial_titles || []).map((t) => (
                      <div key={t.id} className="hint">
                        <Link to={`/trials/${t.id}`}>{t.code}</Link> — {t.title}
                      </div>
                    ))}
                  </td>
                  <td>
                    {(p.ingredient_titles || []).length === 0 && "—"}
                    {(p.ingredient_titles || []).map((i) => (
                      <div key={i.id} className="hint">
                        <Link to={`/ingredients/${i.id}`}>{i.code}</Link> — {i.name}
                      </div>
                    ))}
                  </td>
                  <td>{Number(p.avg_success_rate || 0).toFixed(1)}%</td>
                  <td><Stars value={p.avg_rating} /></td>
                  <td className="hint">{p.notes || "—"}</td>
                  <td>
                    <div className="row-actions">
                      <IconAction name="download" title="Export PDF" onClick={() => exportPdf(p)} />
                      <IconAction name="trash" title="Delete" tone="danger" onClick={() => remove(p)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}

export function ProductArchives() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/trials/?archived=true").then((r) => setItems(r.data)).finally(() => setLoading(false));
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((t) => {
      const matchesSearch = `${t.title} ${t.code} ${t.conducted_by}`
        .toLowerCase()
        .includes(q.toLowerCase());
      if (!matchesSearch) return false;
      if (!filter) return true;
      return (t.archive_reasons || []).includes(filter);
    });
  }, [items, q, filter]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Archives</h1>
          <p>Rejected and expired meal trials moved out of active trials</p>
        </div>
        <Link className="btn btn-back" to="/trials">Meal Trials</Link>
      </div>

      <div className="card">
        <ProductTabs />
        <div className="toolbar">
          <div className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-4.3-4.3M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input
              placeholder="Search archived trials…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <select className="select" style={{ width: 180 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All archives</option>
            <option value="rejected">Rejected only</option>
            <option value="expired">Expired only</option>
          </select>
        </div>

        {loading ? (
          <Skeleton count={6} />
        ) : (
          <>
            {filtered.length === 0 && (
              <div className="empty">No archived meal trials yet.</div>
            )}
            <div className="table-wrap">
              <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Trial / Meal</th>
                <th>Date</th>
                <th>Archive Reason</th>
                <th>Decision</th>
                <th>Expiry</th>
                <th>Rejection Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td>{t.code}</td>
                  <td>
                    <Link to={`/trials/${t.id}`}>{t.title}</Link>
                    <div className="hint">{t.conducted_by || "—"}</div>
                  </td>
                  <td>{formatDate(t.trial_date)}</td>
                  <td>
                    {(t.archive_reasons || []).length === 0 && <span className="hint">—</span>}
                    {(t.archive_reasons || []).map((r) => (
                      <span
                        key={r}
                        className={`badge ${r === "expired" ? "badge-expired" : "badge-rejected"}`}
                        style={{ marginRight: 6 }}
                      >
                        {r === "expired" ? "Expired" : "Rejected"}
                      </span>
                    ))}
                  </td>
                  <td><StatusBadge value={t.verdict} kind="verdict" /></td>
                  <td>
                    {t.expiry_amount ? (
                      <>
                        <strong>{formatExpiryUnit(t.expiry_amount, t.expiry_unit)}</strong>
                        {t.expires_at && (
                          <div className="hint">Ended {formatDateTime(t.expires_at)}</div>
                        )}
                        <div className="hint">{t.expiry_remaining_label}</div>
                      </>
                    ) : "—"}
                  </td>
                  <td className="hint">
                    {t.rejection_reason || t.rejection_notes ? (
                      <>
                        {t.rejection_reason && <div>{t.rejection_reason}</div>}
                        {t.rejection_notes && <div>{t.rejection_notes}</div>}
                      </>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ProductForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [form, setForm] = useState({
    product_name: "",
    ingredient_ids: [],
    notes: "",
    avg_success_rate: 0,
    avg_rating: 0,
    selling_price: null,
  });
  const [trialTitles, setTrialTitles] = useState([]);
  const [ingredients, setIngredients] = useState([]);
  const [ingSearch, setIngSearch] = useState("");
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    api.get("/ingredients/?tab=approved").then((r) => setIngredients(r.data));
    if (!isNew) {
      api.get(`/evaluations/${id}/`).then((r) => {
        setForm({
          product_name: r.data.product_name || "",
          ingredient_ids: r.data.ingredient_ids || [],
          notes: r.data.notes || "",
          avg_success_rate: r.data.avg_success_rate || 0,
          avg_rating: r.data.avg_rating || 0,
          selling_price: r.data.selling_price ?? null,
        });
        setTrialTitles(r.data.trial_titles || []);
      }).finally(() => setLoading(false));
    }
  }, [id, isNew]);

  const groupedIngredients = useMemo(() => {
    const visible = ingredients.filter((i) =>
      `${i.name} ${i.code}`.toLowerCase().includes(ingSearch.toLowerCase())
    );
    const map = new Map();
    for (const item of visible) {
      const key = item.category_name || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, items]) => ({ name, items }));
  }, [ingredients, ingSearch]);

  const toggleIngredient = (ingredientId, checked) => {
    setForm((f) => ({
      ...f,
      ingredient_ids: checked
        ? [...f.ingredient_ids, ingredientId]
        : f.ingredient_ids.filter((x) => x !== ingredientId),
    }));
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      product_name: form.product_name,
      ingredient_ids: form.ingredient_ids,
      notes: form.notes,
    };
    if (isNew) {
      await api.post("/evaluations/", payload);
    } else {
      await api.patch(`/evaluations/${id}/`, payload);
    }
    navigate("/products");
  };

  return (
    <div>
      <div className="page-header">
        <h1>{isNew ? "Add Product" : "Edit Product"}</h1>
        <div className="page-header-actions">
          {!isNew && (
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => exportProductPdf({
                product_name: form.product_name,
                notes: form.notes,
                trial_titles: trialTitles,
                ingredient_titles: ingredients
                  .filter((i) => form.ingredient_ids.includes(i.id))
                  .map((i) => ({ id: i.id, name: i.name })),
              })}
            >
              <Icon name="download" /> Export PDF
            </button>
          )}
          <Link className="btn btn-back" to="/products">Back</Link>
        </div>
      </div>
      {loading ? (
        <div className="card card-pad"><Skeleton count={6} height={36} /></div>
      ) : (
      <form className="card card-pad" onSubmit={save}>
        <div className="field">
          <label>Product Name</label>
          <input className="input" required value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
        </div>

        {!isNew && trialTitles.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Linked Trials</label>
            <p className="hint">Synced from approved meal trials</p>
            {trialTitles.map((t) => (
              <div key={t.id} style={{ marginBottom: 4 }}>
                <Link to={`/trials/${t.id}`}>{t.code}</Link> — {t.title}
              </div>
            ))}
          </div>
        )}

        <div className="field" style={{ marginTop: 12 }}>
          <label>Linked Ingredients</label>
          <p className="hint">Only approved ingredients can be linked to a product.</p>
          <input
            className="input"
            placeholder="Search approved ingredients…"
            value={ingSearch}
            onChange={(e) => setIngSearch(e.target.value)}
            style={{ maxWidth: 360, marginBottom: 12 }}
          />
          {loading ? (
            <Skeleton count={4} />
          ) : groupedIngredients.length === 0 && (
            <div className="empty">No approved ingredients found.</div>
          )}
          {groupedIngredients.map((section) => (
            <div key={section.name} className="ingredient-section" style={{ padding: "0 0 12px" }}>
              <div className="ingredient-section-header">
                <h3>{section.name}</h3>
                <span className="hint">{section.items.length} item{section.items.length === 1 ? "" : "s"}</span>
              </div>
              {section.items.map((i) => (
                <label key={i.id} className="remember">
                  <input
                    type="checkbox"
                    checked={form.ingredient_ids.includes(i.id)}
                    onChange={(e) => toggleIngredient(i.id, e.target.checked)}
                  />
                  {i.code} — {i.name}
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Notes</label>
          <textarea className="textarea" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {!isNew && (
          <div className="stats-grid" style={{ marginTop: 20 }}>
            <div className="stat-card">
              <div className="label">Selling Price (per serving)</div>
              <div className="value" style={{ fontSize: 18 }}>
                {form.selling_price != null ? formatMoney(form.selling_price) : "—"}
              </div>
              <p className="hint">From linked approved meal trials</p>
            </div>
            <div className="stat-card ok">
              <div className="label">Avg Success (from trials)</div>
              <div className="value">{Number(form.avg_success_rate || 0).toFixed(1)}%</div>
            </div>
            <div className="stat-card">
              <div className="label">Avg Rating (from trials)</div>
              <div className="value" style={{ fontSize: 18, marginTop: 10 }}>
                <Stars value={form.avg_rating} />
              </div>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
      )}
    </div>
  );
}
