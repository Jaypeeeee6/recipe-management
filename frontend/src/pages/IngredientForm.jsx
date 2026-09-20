import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../api/client";
import Icon from "../components/Icon";
import Skeleton from "../components/Skeleton";
import Modal from "../components/Modal";
import PhotoUpload, { uploadPendingPhoto } from "../components/PhotoUpload";
import StatusBadge from "../components/StatusBadge";
import { formatMoney, omrFieldValue, sanitizeOmrDecimalInput } from "../utils/format";
import { canManageSecretAccess, canSeeSecrets, canWrite } from "../utils/roles";
import { useAuth } from "../auth/AuthContext";

const empty = {
  name: "",
  category: "",
  supplier: "",
  batch_number: "",
  expiry_date: "",
  received_date: "",
  unit: "kg",
  quantity: 0,
  par_level: 0,
  price_per_unit: "",
  notes: "",
  storage_conditions: "",
  is_secret: false,
  shelf_life_days: "",
  is_trial: false,
  code: "",
  alternative_ids: [],
  secret_viewer_ids: [],
};

export default function IngredientForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState(empty);
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [allIngredients, setAllIngredients] = useState([]);
  const [altSearch, setAltSearch] = useState("");
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("taste");
  const [rejectNotes, setRejectNotes] = useState("");
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [initialSecret, setInitialSecret] = useState(false);
  const [secretConfirmOpen, setSecretConfirmOpen] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [labUsers, setLabUsers] = useState([]);
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    api.get("/categories/").then((r) => setCategories(r.data));
    api.get("/suppliers/").then((r) => setSuppliers(r.data));
    api.get("/ingredients/").then((r) => setAllIngredients(r.data));
    if (canManageSecretAccess(user)) {
      api.get("/users/").then((r) => setLabUsers(r.data)).catch(() => setLabUsers([]));
    }
    if (!isNew) {
      api.get(`/ingredients/${id}/`).then((r) => {
        const d = r.data;
        setInitialSecret(!!d.is_secret);
        setForm({
          ...empty,
          ...d,
          category: d.category || "",
          supplier: d.supplier || "",
          shelf_life_days: d.shelf_life_days || "",
          alternative_ids: d.alternative_ids || [],
          secret_viewer_ids: d.secret_viewer_ids || [],
          quantity: omrFieldValue(d.quantity),
          price_per_unit: omrFieldValue(d.price_per_unit),
        });
        setHistory(d.price_history || []);
      }).finally(() => setLoading(false));
    } else {
      setInitialSecret(false);
    }
  }, [id, isNew, user]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

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

  const buildPayload = () => {
    const {
      code: _code,
      trial_status: _trialStatus,
      rejection_notes: _rejectionNotes,
      photo: _photo,
      price_history: _history,
      alternatives_detail: _alts,
      secret_viewers_detail: _svd,
      category_name: _cn,
      supplier_name: _sn,
      expiry_status: _es,
      days_to_expiry: _dte,
      is_low_stock: _ils,
      created_at: _ca,
      updated_at: _ua,
      ...rest
    } = form;
    const payload = {
      ...rest,
      category: Number(form.category),
      supplier: form.supplier ? Number(form.supplier) : null,
      expiry_date: form.expiry_date || null,
      received_date: form.received_date || null,
      shelf_life_days: form.shelf_life_days === "" ? null : Number(form.shelf_life_days),
      alternative_ids: form.alternative_ids,
      secret_viewer_ids: form.is_secret ? (form.secret_viewer_ids || []) : [],
    };
    delete payload.code;
    if (!canManageSecretAccess(user)) {
      delete payload.secret_viewer_ids;
    }
    return payload;
  };

  const persist = async (password = "") => {
    const payload = buildPayload();
    if (needsSecretPassword()) {
      payload.confirm_password = password;
    }
    if (isNew) {
      try {
        const { data } = await api.post("/ingredients/", payload);
        if (pendingPhoto) {
          await uploadPendingPhoto(`/ingredients/${data.id}/upload_photo/`, pendingPhoto);
        }
        setSecretConfirmOpen(false);
        setConfirmPassword("");
        setToast("Ingredient submitted for approval.");
        if (payload.is_secret && !canSeeSecrets(user) && !(payload.secret_viewer_ids || []).includes(user?.id)) {
          navigate("/ingredients");
        } else {
          navigate(`/ingredients/${data.id}`);
        }
      } catch (err) {
        const detail = err.response?.data;
        if (detail?.confirm_password) {
          setConfirmError(Array.isArray(detail.confirm_password) ? detail.confirm_password[0] : detail.confirm_password);
          setSecretConfirmOpen(true);
          return;
        }
        const message = typeof detail === "string"
          ? detail
          : detail
            ? Object.entries(detail).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ")
            : "Could not save ingredient.";
        setToast(message);
        setSecretConfirmOpen(false);
      }
    } else {
      try {
        const { data } = await api.patch(`/ingredients/${id}/`, payload);
        setSecretConfirmOpen(false);
        setConfirmPassword("");
        if (payload.is_secret && !canSeeSecrets(user) && !(payload.secret_viewer_ids || []).includes(user?.id)) {
          setToast("Ingredient saved as secret. Ask Admin to grant you access if you need to see it.");
          navigate("/ingredients");
          return;
        }
        setInitialSecret(!!data.is_secret);
        setForm({
          ...empty,
          ...data,
          category: data.category || "",
          supplier: data.supplier || "",
          shelf_life_days: data.shelf_life_days || "",
          alternative_ids: data.alternative_ids || [],
          secret_viewer_ids: data.secret_viewer_ids || [],
          quantity: omrFieldValue(data.quantity),
          price_per_unit: omrFieldValue(data.price_per_unit),
        });
        setHistory(data.price_history || []);
        setPendingPhoto(null);
        setToast("Ingredient saved successfully.");
      } catch (err) {
        const detail = err.response?.data;
        if (detail?.confirm_password) {
          setConfirmError(Array.isArray(detail.confirm_password) ? detail.confirm_password[0] : detail.confirm_password);
          setSecretConfirmOpen(true);
          return;
        }
        const message = typeof detail === "string"
          ? detail
          : detail
            ? Object.entries(detail).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ")
            : "Could not save ingredient.";
        setToast(message);
        setSecretConfirmOpen(false);
      }
    }
  };

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

  const alts = allIngredients.filter(
    (i) =>
      String(i.id) !== String(id) &&
      i.name.toLowerCase().includes(altSearch.toLowerCase()) &&
      !form.alternative_ids.includes(i.id)
  );

  const canApprove = !isNew && form.is_trial && form.trial_status !== "approved";
  const canReject = !isNew && (!form.is_trial || form.trial_status === "testing");

  const approve = async () => {
    await api.post(`/ingredients/${id}/approve/`);
    setToast("Ingredient approved.");
    const { data } = await api.get(`/ingredients/${id}/`);
    setForm({ ...empty, ...data, category: data.category || "", supplier: data.supplier || "", shelf_life_days: data.shelf_life_days || "", alternative_ids: data.alternative_ids || [] });
  };

  const reject = async () => {
    await api.post(`/ingredients/${id}/reject/`, {
      rejection_reason: reason,
      rejection_notes: rejectNotes,
    });
    setRejecting(false);
    setRejectNotes("");
    setToast("Ingredient rejected.");
    const { data } = await api.get(`/ingredients/${id}/`);
    setForm({ ...empty, ...data, category: data.category || "", supplier: data.supplier || "", shelf_life_days: data.shelf_life_days || "", alternative_ids: data.alternative_ids || [] });
  };

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}
      <div className="page-breadcrumb hint">
        <Link to="/ingredients">Ingredients</Link> / {isNew ? "Add" : form.name}
      </div>
      <div className="page-header">
        <div>
          <h1>{isNew ? "Add Ingredient" : "Edit Ingredient"}</h1>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-back" to="/ingredients">
            <Icon name="back" />
            Back
          </Link>
          {!loading && (
            <button className="btn btn-save" type="submit" form="ingredient-form">
              <Icon name="save" />
              Save
            </button>
          )}
          {!isNew && canApprove && <button type="button" className="btn btn-primary" onClick={approve}><Icon name="check" /> Approve</button>}
          {!isNew && canReject && <button type="button" className="btn btn-danger" onClick={() => setRejecting(true)}><Icon name="reject" /> Reject</button>}
        </div>
      </div>

      {loading ? (
        <div className="card card-pad"><Skeleton count={8} height={36} /></div>
      ) : (
        <>
      {!isNew && form.is_trial && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <StatusBadge value={form.trial_status} />
          {form.trial_status === "rejected" && form.rejection_notes && (
            <p className="hint" style={{ marginTop: 8 }}>{form.rejection_notes}</p>
          )}
        </div>
      )}

      <form id="ingredient-form" className="card card-pad" onSubmit={save}>
        <div className="form-grid">
          <div className="field">
            <label className="required">Ingredient Name</label>
            <input className="input" required value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="field">
            <label>Product Code</label>
            <input
              className="input"
              value={isNew ? "Auto from category" : (form.code || "")}
              disabled
              readOnly
            />
            <div className="hint">
              {isNew
                ? "Assigned automatically on save (e.g. MT-0001, FL-0002)"
                : "Code is assigned automatically and cannot be changed."}
            </div>
          </div>
          <div className="field">
            <label className="required">Category</label>
            <select className="select" required value={form.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Select</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Supplier <span className="hint">(optional)</span></label>
            <select className="select" value={form.supplier} onChange={(e) => set("supplier", e.target.value)}>
              <option value="">None</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Batch / Lot Number <span className="hint">(optional)</span></label>
            <input className="input" value={form.batch_number || ""} onChange={(e) => set("batch_number", e.target.value)} placeholder="Leave blank if not available" />
          </div>
          <div className="field">
            <label>Received Date</label>
            <input className="input" type="date" value={form.received_date || ""} onChange={(e) => set("received_date", e.target.value)} />
          </div>
          <div className="field">
            <label>Expiry Date</label>
            <input className="input" type="date" value={form.expiry_date || ""} onChange={(e) => set("expiry_date", e.target.value)} />
          </div>
          <div className="field">
            <label>Unit</label>
            <select className="select" value={form.unit} onChange={(e) => set("unit", e.target.value)}>
              {["kg", "g", "L", "ml", "pcs"].map((u) => <option key={u}>{u}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Quantity</label>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={form.quantity}
              onChange={(e) => set("quantity", sanitizeOmrDecimalInput(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Price per Unit (OMR)</label>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={form.price_per_unit}
              onChange={(e) => set("price_per_unit", sanitizeOmrDecimalInput(e.target.value))}
            />
            <div className="hint">Used for recipe cost calculation</div>
          </div>
          <div className="field">
            <label>Shelf Life (days)</label>
            <input className="input" type="number" value={form.shelf_life_days} onChange={(e) => set("shelf_life_days", e.target.value)} />
            <div className="hint">For homemade products like sauces</div>
          </div>
          <div className="field">
            <label>Storage Conditions</label>
            <input className="input" value={form.storage_conditions || ""} onChange={(e) => set("storage_conditions", e.target.value)} />
          </div>
          <div className="field full">
            <PhotoUpload
              label="Ingredient Photo"
              hint="Show how this ingredient looks"
              photoUrl={form.photo || ""}
              uploadUrl={isNew ? null : `/ingredients/${id}/upload_photo/`}
              pendingFile={pendingPhoto}
              onPendingFile={setPendingPhoto}
              onUploaded={(data) => setForm((f) => ({ ...f, photo: data.photo }))}
            />
          </div>
          <div className="field full">
            <label>Notes</label>
            <textarea className="textarea" value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
          </div>
          {canWrite(user) && (
            <label className="remember">
              <input type="checkbox" checked={form.is_secret} onChange={(e) => set("is_secret", e.target.checked)} />
              Secret Ingredient (password required on save)
            </label>
          )}
          {form.is_secret && canManageSecretAccess(user) && (
            <div className="field full" style={{ marginTop: 12 }}>
              <label>Who can see this secret</label>
              <div className="hint" style={{ marginBottom: 8 }}>
                Admin and IT always see secrets. Select Staff or Viewer to grant access.
              </div>
              {grantableUsers.length === 0 ? (
                <div className="hint">No Staff or Viewer accounts available.</div>
              ) : (
                grantableUsers.map((u) => (
                  <label key={u.id} className="remember" style={{ display: "block", marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      checked={(form.secret_viewer_ids || []).includes(u.id)}
                      onChange={() => toggleSecretViewer(u.id)}
                    />
                    {u.display_name || u.email} ({u.role})
                  </label>
                ))
              )}
            </div>
          )}
          {form.is_secret && canWrite(user) && !canManageSecretAccess(user) && (
            <div className="hint" style={{ marginTop: 8 }}>
              After save, only Admin, IT, and users Admin grants can see this ingredient.
            </div>
          )}
          {!canWrite(user) && form.is_secret && (
            <div className="hint" style={{ marginTop: 8 }}>This is a secret ingredient.</div>
          )}
        </div>

        <h3 style={{ marginTop: 24 }}>Alternative Products</h3>
        <input
          className="input"
          placeholder="Search to add an alternative…"
          value={altSearch}
          onChange={(e) => setAltSearch(e.target.value)}
          style={{ maxWidth: 360, marginBottom: 8 }}
        />
        {altSearch && alts.slice(0, 6).map((a) => (
          <button type="button" className="btn btn-ghost" key={a.id} style={{ margin: 4 }} onClick={() => {
            set("alternative_ids", [...form.alternative_ids, a.id]);
            setAltSearch("");
          }}>
            + {a.name}
          </button>
        ))}
        <div>
          {form.alternative_ids.length === 0 && <div className="hint">No alternatives linked</div>}
          {form.alternative_ids.map((aid) => {
            const a = allIngredients.find((x) => x.id === aid);
            return (
              <span key={aid} className="badge badge-gold" style={{ marginRight: 6 }}>
                {a?.name || aid}
                <button type="button" className="icon-btn" onClick={() => set("alternative_ids", form.alternative_ids.filter((x) => x !== aid))}>×</button>
              </span>
            );
          })}
        </div>

        {!isNew && history.length > 0 && (
          <>
            <h3 style={{ marginTop: 24 }}>Price History</h3>
            {history.map((h) => (
              <div className="list-row" key={h.id}>
                <span>{h.recorded_at}</span>
                <strong>{formatMoney(h.price)}</strong>
              </div>
            ))}
          </>
        )}

      </form>

      {secretConfirmOpen && (
        <Modal
          title="Confirm Secret Ingredient"
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
          <p>Enter your account password to mark this as a secret ingredient.</p>
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

      {rejecting && (
        <Modal
          title="Rejection Reason"
          onClose={() => setRejecting(false)}
          actions={
            <>
              <button className="btn btn-back" onClick={() => setRejecting(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={reject}><Icon name="reject" /> Reject</button>
            </>
          }
        >
          <p>Reason for rejecting {form.name}</p>
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
            <textarea className="textarea" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} />
          </div>
        </Modal>
      )}
        </>
      )}
    </div>
  );
}
