import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api/client";
import Icon, { IconAction } from "../components/Icon";
import Modal from "../components/Modal";
import Pagination, { usePagination } from "../components/Pagination";
import PhotoUpload, { uploadPendingPhoto } from "../components/PhotoUpload";
import Skeleton from "../components/Skeleton";
import StatusBadge from "../components/StatusBadge";
import SecretBadge from "../components/SecretBadge";
import Stars from "../components/Stars";
import { formatDate, formatDateTime, formatExpiryUnit, formatMoney } from "../utils/format";
import { exportProductPdf } from "../utils/productExport";
import { canManageSecretAccess, canSeeSecrets, canWrite } from "../utils/roles";
import { useAuth } from "../auth/AuthContext";
import { apiErrorMessage, useDialogs } from "../dialogs/DialogsContext";

function ProductTabs() {
  const location = useLocation();
  const [params] = useSearchParams();
  const isArchives = location.pathname.includes("/archives");
  const isSecret = !isArchives && params.get("tab") === "secret";
  const isProducts = !isArchives && !isSecret;
  return (
    <div className="tabs">
      <Link to="/products" className={`tab ${isProducts ? "active" : ""}`}>
        Products
      </Link>
      <Link to="/products?tab=secret" className={`tab ${isSecret ? "active" : ""}`}>
        Secret
      </Link>
      <Link to="/products/archives" className={`tab ${isArchives ? "active" : ""}`}>
        Archives
      </Link>
    </div>
  );
}

const LIST_PREVIEW = 2;

function ExpandableList({ items, renderItem, empty = "—" }) {
  const [open, setOpen] = useState(false);
  const list = items || [];
  if (list.length === 0) return empty;
  const shown = open ? list : list.slice(0, LIST_PREVIEW);
  const hidden = list.length - LIST_PREVIEW;
  return (
    <div className="expandable-list">
      {shown.map(renderItem)}
      {list.length > LIST_PREVIEW && (
        <button
          type="button"
          className="btn-show-more"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Show less" : `Show more (${hidden})`}
        </button>
      )}
    </div>
  );
}

export function ProductList() {
  const { showError, confirmDelete } = useDialogs();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const tab = params.get("tab") === "secret" ? "secret" : "all";

  const load = (activeTab = tab) => {
    const query = new URLSearchParams();
    if (activeTab === "secret") query.set("tab", "secret");
    const qs = query.toString();
    return api.get(`/evaluations/${qs ? `?${qs}` : ""}`).then((r) => setItems(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [tab]);

  const remove = async (p) => {
    const ok = await confirmDelete("Delete this product?");
    if (!ok) return;
    try {
      await api.delete(`/evaluations/${p.id}/`);
      load();
    } catch (err) {
      showError(apiErrorMessage(err, "Could not delete product."));
    }
  };

  const exportPdf = async (p) => {
    try {
      await exportProductPdf(p);
    } catch {
      showError("Could not export this product.");
    }
  };

  const {
    page, setPage, pageItems, total, totalPages, from, to,
  } = usePagination(items, 10, tab);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{tab === "secret" ? "Secret Products" : "Products"}</h1>
          <p>
            {tab === "secret"
              ? "Products marked secret — visible only to Admin, IT, and granted users"
              : "Approved meal trials sync here automatically, or add products manually"}
          </p>
        </div>
        <Link className="btn btn-add" to="/products/new"><Icon name="plus" /> Add Product</Link>
      </div>

      <ProductTabs />

      <div className="card">
        {loading ? (
          <div className="card-pad"><Skeleton count={6} /></div>
        ) : (
        <>
        <div className="table-wrap">
          <table className="data products-table">
            <thead>
              <tr>
                <th className="col-product">Product</th>
                <th className="col-price">Selling Price</th>
                <th>Approved Trials</th>
                <th>Ingredients</th>
                <th>Avg Success</th>
                <th>Avg Rating</th>
                <th className="col-notes">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td colSpan="8">
                    <div className="empty">
                      {tab === "secret"
                        ? "No secret products."
                        : "No products yet. Approve a meal trial or add a product manually."}
                    </div>
                  </td>
                </tr>
              )}
              {pageItems.map((p) => (
                <tr key={p.id}>
                  <td className="col-product">
                    {p.photo ? (
                      <img className="thumb" src={p.photo} alt="" />
                    ) : null}
                    <Link to={`/products/${p.id}`}>{p.product_name}</Link>
                    {p.is_secret && <SecretBadge className="badge-secret-inline" />}
                  </td>
                  <td className="col-price">{p.selling_price != null ? formatMoney(p.selling_price) : "—"}</td>
                  <td>
                    <ExpandableList
                      items={p.trial_titles}
                      renderItem={(t) => (
                        <div key={t.id} className="expandable-list-item">
                          <Link to={`/trials/${t.id}`}>{t.code}</Link> — {t.title}
                        </div>
                      )}
                    />
                  </td>
                  <td>
                    <ExpandableList
                      items={p.ingredient_titles}
                      renderItem={(i) => (
                        <div key={i.id} className="expandable-list-item">
                          <Link to={`/ingredients/${i.id}`}>{i.code}</Link> — {i.name}
                        </div>
                      )}
                    />
                  </td>
                  <td>{Number(p.avg_success_rate || 0).toFixed(1)}%</td>
                  <td><Stars value={p.avg_rating} /></td>
                  <td className="col-notes">{p.notes || "—"}</td>
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
        <Pagination page={page} totalPages={totalPages} onChange={setPage} total={total} from={from} to={to} />
        </>
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

  const {
    page, setPage, pageItems, total, totalPages, from, to,
  } = usePagination(filtered, 10, `${q}|${filter}`);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Archives</h1>
          <p>Rejected and expired meal trials moved out of active trials</p>
        </div>
        <Link className="btn btn-back" to="/trials">Meal Trials</Link>
      </div>

      <ProductTabs />

      <div className="card">
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
              {pageItems.map((t) => (
                <tr key={t.id}>
                  <td>{t.code}</td>
                  <td>
                    <Link to={`/trials/${t.id}`}>{t.title}</Link>
                    {t.is_secret && <SecretBadge className="badge-secret-inline" />}
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
        <Pagination page={page} totalPages={totalPages} onChange={setPage} total={total} from={from} to={to} />
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
  const { user } = useAuth();
  const { showError, showSuccess } = useDialogs();
  const [form, setForm] = useState({
    product_name: "",
    notes: "",
    avg_success_rate: 0,
    avg_rating: 0,
    selling_price: null,
    is_secret: false,
    secret_viewer_ids: [],
  });
  const [productPhoto, setProductPhoto] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [trialTitles, setTrialTitles] = useState([]);
  const [ingredientTitles, setIngredientTitles] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [initialSecret, setInitialSecret] = useState(false);
  const [secretConfirmOpen, setSecretConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [labUsers, setLabUsers] = useState([]);

  useEffect(() => {
    if (canManageSecretAccess(user)) {
      api.get("/users/").then((r) => setLabUsers(r.data)).catch(() => setLabUsers([]));
    }
    if (!isNew) {
      api.get(`/evaluations/${id}/`).then((r) => {
        setInitialSecret(!!r.data.is_secret);
        setForm({
          product_name: r.data.product_name || "",
          notes: r.data.notes || "",
          avg_success_rate: r.data.avg_success_rate || 0,
          avg_rating: r.data.avg_rating || 0,
          selling_price: r.data.selling_price ?? null,
          is_secret: !!r.data.is_secret,
          secret_viewer_ids: r.data.secret_viewer_ids || [],
        });
        setProductPhoto(r.data.photo || "");
        setPendingPhoto(null);
        setTrialTitles(r.data.trial_titles || []);
        setIngredientTitles(r.data.ingredient_titles || []);
      }).finally(() => setLoading(false));
    } else {
      setInitialSecret(false);
      setProductPhoto("");
      setPendingPhoto(null);
    }
  }, [id, isNew, user]);

  const grantableUsers = labUsers.filter((u) => u.role === "staff" || u.role === "viewer");

  const toggleSecretViewer = (uid) => {
    setForm((f) => {
      const ids = f.secret_viewer_ids || [];
      return {
        ...f,
        secret_viewer_ids: ids.includes(uid) ? ids.filter((x) => x !== uid) : [...ids, uid],
      };
    });
  };

  const needsSecretPassword = () => form.is_secret && (isNew || !initialSecret);

  const save = async (e) => {
    e.preventDefault();
    if (needsSecretPassword()) {
      setConfirmPassword("");
      setConfirmError("");
      setSecretConfirmOpen(true);
      return;
    }
    await persist();
  };

  const confirmSecretSave = async () => {
    if (!confirmPassword.trim()) {
      setConfirmError("Enter your password to continue.");
      return;
    }
    setConfirmError("");
    await persist(confirmPassword);
  };

  const persist = async (password = "") => {
    const payload = {
      product_name: form.product_name,
      notes: form.notes,
      is_secret: form.is_secret,
      secret_viewer_ids: form.is_secret ? (form.secret_viewer_ids || []) : [],
    };
    if (!canManageSecretAccess(user)) {
      delete payload.secret_viewer_ids;
    }
    if (needsSecretPassword()) {
      payload.confirm_password = password;
    }
    try {
      if (isNew) {
        const { data } = await api.post("/evaluations/", payload);
        if (pendingPhoto) {
          await uploadPendingPhoto(`/evaluations/${data.id}/upload_photo/`, pendingPhoto);
        }
        setSecretConfirmOpen(false);
        setConfirmPassword("");
        if (payload.is_secret && !canSeeSecrets(user) && !(payload.secret_viewer_ids || []).includes(user?.id)) {
          navigate("/products");
        } else {
          navigate(data.is_secret ? "/products?tab=secret" : "/products");
        }
      } else {
        const { data } = await api.patch(`/evaluations/${id}/`, payload);
        setSecretConfirmOpen(false);
        setConfirmPassword("");
        if (payload.is_secret && !canSeeSecrets(user) && !(payload.secret_viewer_ids || []).includes(user?.id)) {
          showSuccess("Product saved as secret. Ask Admin to grant you access if you need to see it.");
          navigate("/products");
          return;
        }
        navigate(data.is_secret ? "/products?tab=secret" : "/products");
      }
    } catch (err) {
      const detail = err.response?.data;
      if (detail?.confirm_password) {
        setConfirmError(Array.isArray(detail.confirm_password) ? detail.confirm_password[0] : detail.confirm_password);
        setSecretConfirmOpen(true);
        return;
      }
      setSecretConfirmOpen(false);
      showError(apiErrorMessage(err, "Could not save product."));
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title-with-badge">
            {isNew ? "Add Product" : "Edit Product"}
            {!isNew && form.is_secret && <SecretBadge />}
          </h1>
        </div>
        <div className="page-header-actions">
          {!isNew && (
            <button
              type="button"
              className="btn btn-gold"
              onClick={() => exportProductPdf({
                product_name: form.product_name,
                notes: form.notes,
                trial_titles: trialTitles,
                ingredient_titles: ingredientTitles,
              })}
            >
              <Icon name="download" /> Export PDF
            </button>
          )}
          <Link className="btn btn-back" to="/products">
            <Icon name="back" />
            Back
          </Link>
          {!loading && (
            <button className="btn btn-save" type="submit" form="product-form">
              <Icon name="save" />
              Save
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="card card-pad"><Skeleton count={6} height={36} /></div>
      ) : (
      <form id="product-form" className="card card-pad" onSubmit={save}>
        {(canWrite(user) || form.is_secret) && (
          <div className="secret-section">
            {canWrite(user) && (
              <label className="switch-field">
                <input
                  className="switch-input"
                  type="checkbox"
                  role="switch"
                  checked={form.is_secret}
                  onChange={(e) => setForm({ ...form, is_secret: e.target.checked })}
                />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-knob">
                    <svg className="switch-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  </span>
                </span>
                <span className="switch-text">Secret Product (password required on save)</span>
              </label>
            )}
            {form.is_secret && canManageSecretAccess(user) && (
              <div className="field full secret-access">
                <label>Who can see this secret</label>
                <div className="hint">
                  Admin and IT always see secrets. Select Staff or Viewer to grant access.
                </div>
                {grantableUsers.length === 0 ? (
                  <div className="hint">No Staff or Viewer accounts available.</div>
                ) : (
                  <div className="secret-viewer-list">
                    {grantableUsers.map((u) => (
                      <label key={u.id} className="secret-viewer">
                        <input
                          type="checkbox"
                          checked={(form.secret_viewer_ids || []).includes(u.id)}
                          onChange={() => toggleSecretViewer(u.id)}
                        />
                        <span>{u.display_name || u.email} ({u.role})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {form.is_secret && canWrite(user) && !canManageSecretAccess(user) && (
              <div className="hint full">
                After save, only Admin, IT, and users Admin grants can see this product.
              </div>
            )}
            {!canWrite(user) && form.is_secret && (
              <div className="hint full">This is a secret product.</div>
            )}
          </div>
        )}
        <div className="field">
          <label className="required">Product Name</label>
          <input className="input" required value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
        </div>
        <div className="field full">
          <PhotoUpload
            label="Dish Photo"
            hint="Show how the finished meal looks"
            photoUrl={productPhoto}
            uploadUrl={isNew ? null : `/evaluations/${id}/upload_photo/`}
            pendingFile={pendingPhoto}
            onPendingFile={setPendingPhoto}
            onUploaded={(data) => setProductPhoto(data.photo || "")}
          />
        </div>

        {!isNew && trialTitles.length > 0 && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>Linked Trials ({trialTitles.length})</label>
            <p className="hint">Synced from approved meal trials</p>
            <div className="table-wrap linked-trials-table">
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Trial Name</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {trialTitles.map((t) => (
                    <tr key={t.id}>
                      <td>{t.code || "—"}</td>
                      <td>{t.title || "—"}</td>
                      <td className="row-actions">
                        <Link className="btn btn-ghost" to={`/trials/${t.id}`}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isNew && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ margin: 0 }}>Linked Ingredients</h3>
            <p className="hint" style={{ marginBottom: 12 }}>
              Synced automatically from linked meal trials
            </p>
            {ingredientTitles.length === 0 ? (
              <div className="hint">No ingredients yet — they appear when linked trials have approved ingredients.</div>
            ) : (
              <>
                <div className="recipe-line recipe-line-header product-ingredient-line">
                  <span>Ingredient</span>
                  <span>Category</span>
                  <span />
                </div>
                {ingredientTitles.map((i) => (
                  <div className="recipe-line product-ingredient-line" key={i.id}>
                    <div className="input product-ingredient-readonly">
                      {i.code ? `${i.code} — ${i.name}` : (i.name || "—")}
                    </div>
                    <div className="input product-ingredient-readonly">
                      {i.category_name || "—"}
                    </div>
                    <Link className="btn btn-ghost" to={`/ingredients/${i.id}`}>View</Link>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
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
      </form>
      )}

      {secretConfirmOpen && (
        <Modal
          title="Confirm Secret Product"
          onClose={() => {
            setSecretConfirmOpen(false);
            setConfirmPassword("");
            setConfirmError("");
          }}
          actions={
            <>
              <button
                className="btn btn-back"
                type="button"
                onClick={() => {
                  setSecretConfirmOpen(false);
                  setConfirmPassword("");
                  setConfirmError("");
                }}
              >
                <Icon name="back" />
                Cancel
              </button>
              <button className="btn btn-save" type="button" onClick={confirmSecretSave}>
                <Icon name="save" />
                Confirm &amp; Save
              </button>
            </>
          }
        >
          <p>Enter your account password to mark this as a secret product.</p>
          <div className="field" style={{ marginTop: 12 }}>
            <label className="required">Password</label>
            <input
              className="input"
              type="password"
              autoFocus
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setConfirmError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmSecretSave();
                }
              }}
            />
            {confirmError && <div className="hint" style={{ color: "var(--danger, #b42318)", marginTop: 6 }}>{confirmError}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}
