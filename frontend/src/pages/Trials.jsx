import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import api from "../api/client";
import Icon, { IconAction } from "../components/Icon";
import Modal from "../components/Modal";
import Skeleton from "../components/Skeleton";
import StatusBadge from "../components/StatusBadge";
import Stars from "../components/Stars";
import PhotoUpload, { uploadPendingPhoto } from "../components/PhotoUpload";
import { foodCostLabel, foodCostTone, formatDate, formatDateTime, formatExpiryUnit, formatMoney, localToday, omrFieldValue, sanitizeOmrDecimalInput } from "../utils/format";
import { canWrite } from "../utils/roles";
import { useAuth } from "../auth/AuthContext";

function previewExpiry(date, amount, unit) {
  if (!date || !amount) return "";
  const n = Number(amount);
  if (Number.isNaN(n) || n <= 0) return "";
  const [year, month, day] = date.split("-").map(Number);
  const start = unit === "hours"
    ? new Date(year, month - 1, day, new Date().getHours(), new Date().getMinutes(), 0)
    : new Date(year, month - 1, day, 0, 0, 0);
  if (unit === "hours") start.setHours(start.getHours() + n);
  else start.setDate(start.getDate() + n);
  return start.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function isExpiringSoon(trial) {
  return trial?.expiry_status === "expiring_soon";
}

function canApproveTrial(trial) {
  return trial.verdict !== "suitable" && trial.expiry_status !== "expired";
}

function canRejectTrial(trial) {
  return trial.verdict !== "not_suitable" && trial.expiry_status !== "expired";
}

function previewLineCost(quantity, recipeUnit, costPerUnit, stockUnit) {
  const qty = Number(quantity);
  const price = Number(costPerUnit);
  if (!qty || !price || Number.isNaN(qty) || Number.isNaN(price)) return null;
  const ru = (recipeUnit || "").toLowerCase();
  const su = (stockUnit || recipeUnit || "").toLowerCase();
  if ((ru === "g" && su === "kg") || (ru === "ml" && su === "l")) {
    return (qty / 1000) * price;
  }
  if ((ru === "kg" && su === "g") || (ru === "l" && su === "ml")) {
    return qty * 1000 * price;
  }
  return qty * price;
}

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}

function roundPct(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10) / 10;
}

function estimateRecipeCost(recipeLines, servings) {
  let total = 0;
  for (const line of recipeLines || []) {
    const stockUnit = line.stock_unit || line.unit;
    const cost = previewLineCost(line.quantity, line.unit, line.cost_per_unit, stockUnit);
    if (cost != null) total += cost;
  }
  const portions = Math.max(1, Number(servings) || 1);
  return {
    totalCost: roundMoney(total),
    costPerServing: roundMoney(total / portions),
  };
}

function profitFromSellingPrice(costPerServing, sellingPrice) {
  const cost = Number(costPerServing);
  const price = Number(sellingPrice);
  if (!price || Number.isNaN(price) || price <= 0 || Number.isNaN(cost)) return null;
  const gross = roundMoney(price - cost);
  const margin = roundPct((gross / price) * 100);
  const foodCostPct = roundPct((cost / price) * 100);
  return { gross, margin, foodCostPct, sellingPrice: roundMoney(price) };
}

function sellingPriceFromMargin(costPerServing, marginPct) {
  const cost = Number(costPerServing);
  const margin = Number(marginPct);
  if (Number.isNaN(cost) || cost < 0 || Number.isNaN(margin) || margin >= 100) return null;
  return roundMoney(cost / (1 - margin / 100));
}

function sanitizePercentInput(raw) {
  if (raw == null) return "";
  let value = String(raw).replace(/,/g, ".").replace(/[^0-9.]/g, "");
  if (value === "") return "";
  const dot = value.indexOf(".");
  if (dot !== -1) {
    const whole = value.slice(0, dot);
    const frac = value.slice(dot + 1).replace(/\./g, "").slice(0, 1);
    value = `${whole}.${frac}`;
  }
  return value;
}

export function TrialList() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [params] = useSearchParams();
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState("taste");
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState("");
  const [compareIds, setCompareIds] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/trials/?archived=false").then((r) => setItems(r.data)).finally(() => setLoading(false));
  useEffect(() => {
    load();
    if (params.get("q")) setQ(params.get("q"));
  }, []);

  const filtered = items.filter((t) =>
    `${t.title} ${t.code} ${t.conducted_by}`.toLowerCase().includes(q.toLowerCase())
  );

  const expiringSoon = useMemo(
    () => items.filter(isExpiringSoon),
    [items]
  );

  const toggleCompare = (id) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const remove = async (t) => {
    if (!confirm("Delete this trial?")) return;
    await api.delete(`/trials/${t.id}/`);
    load();
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const approve = async (trial) => {
    await api.post(`/trials/${trial.id}/approve/`);
    showToast("Trial approved.");
    load();
  };

  const reject = async () => {
    await api.post(`/trials/${rejecting.id}/reject/`, {
      rejection_reason: reason,
      rejection_notes: notes,
    });
    setRejecting(null);
    setNotes("");
    showToast("Trial rejected.");
    load();
  };

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}
      <div className="page-header">
        <div>
          <h1>Meal Trials</h1>
          <p>Recipe tests, ratings, and approve or reject for production</p>
        </div>
        <div className="page-header-actions">
          <Link
            className="btn btn-gold"
            to={compareIds.length >= 2 ? `/trials/compare?ids=${compareIds.join(",")}` : "/trials/compare"}
          >
            <Icon name="compare" />
            Compare Trials{compareIds.length ? ` (${compareIds.length})` : ""}
          </Link>
          {canWrite(user) && (
            <Link className="btn btn-add" to="/trials/new">
              <Icon name="plus" />
              New Trial
            </Link>
          )}
        </div>
      </div>
      {expiringSoon.length > 0 && (
        <div className="alert alert-warn" role="alert">
          <strong>
            {expiringSoon.length === 1
              ? "1 trial is expiring soon"
              : `${expiringSoon.length} trials are expiring soon`}
          </strong>
          <ul className="alert-list">
            {expiringSoon.map((t) => (
              <li key={t.id}>
                <Link to={`/trials/${t.id}`}>{t.code || t.title}</Link>
                {t.title ? ` — ${t.title}` : ""}
                {t.expiry_remaining_label ? ` (${t.expiry_remaining_label})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card">
        <div className="toolbar">
          <div className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-4.3-4.3M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input placeholder="Search trials…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <Skeleton count={6} />
        ) : (
          <>
            {filtered.length === 0 && <div className="empty">No trials found.</div>}
            <div className="table-wrap">
              <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Code</th>
                <th>Trial / Meal</th>
                <th>Date</th>
                <th>Expiry</th>
                <th>By</th>
                <th>Success</th>
                <th>Decision</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className={isExpiringSoon(t) ? "row-warn" : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      title="Select for comparison"
                      checked={compareIds.includes(t.id)}
                      disabled={!compareIds.includes(t.id) && compareIds.length >= 4}
                      onChange={() => toggleCompare(t.id)}
                    />
                  </td>
                  <td>{t.code}</td>
                  <td>
                    {t.final_dish_photo || t.photo ? (
                      <img className="thumb" src={t.final_dish_photo || t.photo} alt="" />
                    ) : null}
                    <Link to={`/trials/${t.id}`}>{t.title}</Link>
                    {t.expiry_status && (
                      <div style={{ marginTop: 4 }}>
                        <StatusBadge value={t.expiry_status} kind="expiry" />
                      </div>
                    )}
                    {isExpiringSoon(t) && (
                      <div className="hint hint-warn" style={{ marginTop: 4 }}>Expiring soon</div>
                    )}
                  </td>
                  <td>{formatDate(t.trial_date)}</td>
                  <td>
                    {t.expiry_amount ? (
                      <>
                        <strong>{formatExpiryUnit(t.expiry_amount, t.expiry_unit)}</strong>
                        {t.expires_at && (
                          <div className="hint">Expires {formatDateTime(t.expires_at)}</div>
                        )}
                        <div className="hint">{t.expiry_remaining_label}</div>
                      </>
                    ) : "—"}
                  </td>
                  <td>{t.conducted_by}</td>
                  <td>{t.success_rate}%</td>
                  <td><StatusBadge value={t.verdict} kind="verdict" /></td>
                  <td><StatusBadge value={t.status} /></td>
                  <td className="row-actions">
                    {canApproveTrial(t) && (
                      <IconAction name="check" title="Approve" tone="ok" onClick={() => approve(t)} />
                    )}
                    {canRejectTrial(t) && (
                      <IconAction name="reject" title="Reject" tone="danger" onClick={() => setRejecting(t)} />
                    )}
                    <IconAction name="trash" title="Delete" tone="danger" onClick={() => remove(t)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          </>
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
          <p>Reason for rejecting {rejecting.title}</p>
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

const emptyTrial = {
  title: "",
  code: "",
  supplier: "",
  trial_date: localToday(),
  conducted_by: "",
  success_rate: 0,
  taste: 0,
  texture: 0,
  cost: 0,
  consistency: 0,
  overall: 0,
  servings: 1,
  selling_price: "",
  cooking_temperature: "",
  cooking_duration: "",
  repetition_number: 1,
  expiry_amount: 24,
  expiry_unit: "hours",
  notes: "",
  ingredient_ids: [],
  recipe_lines: [],
  prep_steps: [],
};

export function TrialForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyTrial);
  const [ingredients, setIngredients] = useState([]);
  const [ingSearch, setIngSearch] = useState("");
  const [profitMargin, setProfitMargin] = useState("");
  const [pricingSource, setPricingSource] = useState("price"); // "price" | "margin"
  const [pendingPhoto, setPendingPhoto] = useState(null);
  const [dishPhoto, setDishPhoto] = useState("");
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    api.get("/ingredients/?tab=approved").then((r) => setIngredients(r.data));
    if (!isNew) {
      api.get(`/trials/${id}/`).then((r) => {
        const d = r.data;
        const nextForm = {
          ...emptyTrial,
          ...d,
          supplier: d.supplier || "",
          selling_price: d.selling_price != null && d.selling_price !== "" ? omrFieldValue(d.selling_price) : "",
          cooking_temperature: d.cooking_temperature || "",
          cooking_duration: d.cooking_duration || "",
          expiry_amount: d.expiry_amount ?? 24,
          expiry_unit: d.expiry_unit || "hours",
          ingredient_ids: d.ingredient_ids || [],
          recipe_lines: (d.recipe_lines || []).map((line) => ({
            ...line,
            quantity: omrFieldValue(line.quantity),
            cost_per_unit: omrFieldValue(line.cost_per_unit),
          })),
          prep_steps: (d.prep_steps || []).map((s) => ({ text: s.text })),
        };
        setForm(nextForm);
        setDishPhoto(d.final_dish_photo || d.photo || "");
        const { costPerServing } = estimateRecipeCost(nextForm.recipe_lines, nextForm.servings);
        const profit = profitFromSellingPrice(costPerServing, nextForm.selling_price);
        setProfitMargin(profit ? String(profit.margin) : "");
        setPricingSource("price");
      }).finally(() => setLoading(false));
    }
  }, [id, isNew]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const costPreview = useMemo(
    () => estimateRecipeCost(form.recipe_lines, form.servings),
    [form.recipe_lines, form.servings]
  );

  const profitPreview = useMemo(
    () => profitFromSellingPrice(costPreview.costPerServing, form.selling_price),
    [costPreview.costPerServing, form.selling_price]
  );

  // Keep the other pricing field in sync when recipe cost changes.
  useEffect(() => {
    if (costPreview.costPerServing <= 0) return;
    if (pricingSource === "margin" && profitMargin !== "") {
      const recommended = sellingPriceFromMargin(costPreview.costPerServing, profitMargin);
      if (recommended != null) {
        setForm((f) => {
          const next = omrFieldValue(recommended);
          return f.selling_price === next ? f : { ...f, selling_price: next };
        });
      }
      return;
    }
    if (pricingSource === "price" && form.selling_price !== "") {
      const profit = profitFromSellingPrice(costPreview.costPerServing, form.selling_price);
      if (profit) setProfitMargin(String(profit.margin));
    }
  }, [costPreview.costPerServing, pricingSource, profitMargin, form.selling_price]);

  const onSellingPriceChange = (raw) => {
    const value = sanitizeOmrDecimalInput(raw);
    setPricingSource("price");
    set("selling_price", value);
    if (value === "" || costPreview.costPerServing <= 0) {
      if (value === "") setProfitMargin("");
      return;
    }
    const profit = profitFromSellingPrice(costPreview.costPerServing, value);
    setProfitMargin(profit ? String(profit.margin) : "");
  };

  const onProfitMarginChange = (raw) => {
    const value = sanitizePercentInput(raw);
    setPricingSource("margin");
    setProfitMargin(value);
    if (value === "" || costPreview.costPerServing <= 0) return;
    const margin = Number(value);
    if (Number.isNaN(margin) || margin >= 100) return;
    const recommended = sellingPriceFromMargin(costPreview.costPerServing, margin);
    if (recommended != null) set("selling_price", omrFieldValue(recommended));
  };

  const onServingsChange = (raw) => {
    set("servings", Number(raw) || 1);
  };

  const addLine = (ing) => {
    setForm((f) => ({
      ...f,
      ingredient_ids: f.ingredient_ids.includes(ing.id) ? f.ingredient_ids : [...f.ingredient_ids, ing.id],
      recipe_lines: [
        ...f.recipe_lines,
        {
          name: ing.name,
          quantity: "",
          unit: ing.unit === "kg" ? "g" : ing.unit === "L" ? "ml" : ing.unit,
          stock_unit: ing.unit,
          ingredient: ing.id,
          cost_per_unit: ing.price_per_unit != null ? omrFieldValue(ing.price_per_unit) : "",
        },
      ],
    }));
    setIngSearch("");
  };

  const updateLine = (i, patch) => {
    setForm((f) => {
      const lines = [...f.recipe_lines];
      lines[i] = { ...lines[i], ...patch };
      return { ...f, recipe_lines: lines };
    });
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      title: form.title,
      trial_date: form.trial_date || null,
      conducted_by: form.conducted_by,
      success_rate: form.success_rate,
      taste: form.taste,
      texture: form.texture,
      cost: form.cost,
      consistency: form.consistency,
      overall: form.overall,
      servings: form.servings,
      selling_price: form.selling_price === "" ? null : form.selling_price,
      cooking_temperature: form.cooking_temperature === "" ? null : Number(form.cooking_temperature),
      cooking_duration: form.cooking_duration === "" ? null : Number(form.cooking_duration),
      repetition_number: form.repetition_number,
      expiry_amount: form.expiry_amount === "" ? null : Number(form.expiry_amount),
      expiry_unit: form.expiry_unit || "days",
      notes: form.notes,
      ingredient_ids: form.ingredient_ids,
      prep_steps: form.prep_steps.map((s, i) => ({ text: s.text, sort_order: i })),
      recipe_lines: form.recipe_lines.map((l, i) => ({
        name: l.name,
        quantity: l.quantity === "" ? 0 : l.quantity,
        unit: l.unit,
        ingredient: l.ingredient || null,
        cost_per_unit: l.cost_per_unit === "" ? 0 : l.cost_per_unit,
        sort_order: i,
      })),
    };
    try {
      setSaveError("");
      if (isNew) {
        const { data } = await api.post("/trials/", payload);
        if (pendingPhoto) {
          await uploadPendingPhoto(`/trials/${data.id}/upload_photo/`, pendingPhoto, "final_dish_photo");
        }
        navigate(`/trials/${data.id}`);
      } else {
        await api.patch(`/trials/${id}/`, payload);
        navigate(`/trials/${id}`);
      }
    } catch (err) {
      const detail = err.response?.data;
      const message = typeof detail === "string"
        ? detail
        : detail?.detail
          || Object.entries(detail || {})
            .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
            .join("; ")
          || "Could not save trial.";
      setSaveError(message);
    }
  };

  const matches = ingredients.filter(
    (i) => i.name.toLowerCase().includes(ingSearch.toLowerCase()) && ingSearch
  ).slice(0, 8);

  return (
    <div>
      <div className="page-header">
        <h1>{isNew ? "New Trial" : "Edit Trial"}</h1>
        <Link className="btn btn-back" to={isNew ? "/trials" : `/trials/${id}`}>Back</Link>
      </div>
      {loading ? (
        <div className="card card-pad"><Skeleton count={8} height={36} /></div>
      ) : (
      <form className="card card-pad" onSubmit={save}>
        {saveError && <div className="alert alert-warn" style={{ marginBottom: 16 }}>{saveError}</div>}
        <div className="form-grid">
          <div className="field full">
            <label>Trial Title / Meal Name</label>
            <input className="input" required value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="field full">
            <PhotoUpload
              label="Dish Photo"
              hint="Show how the finished meal looks"
              photoUrl={dishPhoto}
              uploadUrl={isNew ? null : `/trials/${id}/upload_photo/`}
              field="final_dish_photo"
              pendingFile={pendingPhoto}
              onPendingFile={setPendingPhoto}
              onUploaded={(data) => setDishPhoto(data.final_dish_photo || data.photo || "")}
            />
          </div>
          <div className="field">
            <label>Trial Code</label>
            <input
              className="input"
              value={isNew ? "Auto (TEST-0001)" : (form.code || "")}
              disabled
              readOnly
            />
            <div className="hint">
              {isNew ? "Assigned automatically on save as TEST-0001, TEST-0002, …" : "Code is assigned automatically and cannot be changed."}
            </div>
          </div>
          <div className="field">
            <label>Trial Date</label>
            <input className="input" type="date" value={form.trial_date || ""} onChange={(e) => set("trial_date", e.target.value)} />
          </div>
          <div className="field expiry-panel">
            <label>Trial expiry (required)</label>
            <div className="expiry-row">
              <input
                className="input"
                type="number"
                min="1"
                required
                value={form.expiry_amount}
                onChange={(e) => set("expiry_amount", e.target.value)}
              />
              <select className="select" style={{ width: 140 }} value={form.expiry_unit} onChange={(e) => set("expiry_unit", e.target.value)}>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
            <div className="hint" style={{ marginTop: 8 }}>
              How long this trial stays valid from the trial date
              {form.expiry_unit === "days" ? " (days count from the start of that date)" : " (hours count from the current time on that date)"}
              {form.trial_date && form.expiry_amount ? ` — expires ${previewExpiry(form.trial_date, form.expiry_amount, form.expiry_unit)}.` : "."}
            </div>
          </div>
          <div className="field">
            <label>Conducted By</label>
            <input className="input" value={form.conducted_by} onChange={(e) => set("conducted_by", e.target.value)} />
          </div>
          <div className="field">
            <label>Servings (portions yield)</label>
            <input className="input" type="number" min="1" value={form.servings} onChange={(e) => onServingsChange(e.target.value)} />
          </div>
          <div className="field">
            <label>Cooking Temperature (°C)</label>
            <input className="input" type="number" value={form.cooking_temperature} onChange={(e) => set("cooking_temperature", e.target.value)} />
          </div>
          <div className="field">
            <label>Cooking Duration (min)</label>
            <input className="input" type="number" value={form.cooking_duration} onChange={(e) => set("cooking_duration", e.target.value)} />
          </div>
          <div className="field">
            <label>Repetition #</label>
            <input className="input" type="number" min="1" value={form.repetition_number} onChange={(e) => set("repetition_number", Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Success Rate (%)</label>
            <input className="input" type="number" min="0" max="100" value={form.success_rate} onChange={(e) => set("success_rate", Number(e.target.value))} />
          </div>
        </div>

        <h3 style={{ marginTop: 20 }}>Recipe Ingredients</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          Unit price is OMR per stock unit (e.g. per kg). Line cost is calculated from quantity — e.g. 5 OMR/kg × 1 g = 0.005 OMR for that line.
        </p>
        <input className="input" placeholder="Search to add an ingredient…" value={ingSearch} onChange={(e) => setIngSearch(e.target.value)} style={{ maxWidth: 360 }} />
        {matches.map((i) => (
          <button type="button" key={i.id} className="btn btn-ghost" style={{ margin: 4 }} onClick={() => addLine(i)}>+ {i.name}</button>
        ))}
        {form.recipe_lines.length > 0 && (
          <div className="recipe-line recipe-line-header">
            <span>Ingredient</span>
            <span>Quantity</span>
            <span>Unit</span>
            <span>Unit Price</span>
            <span>Line Cost</span>
            <span />
          </div>
        )}
        {form.recipe_lines.map((line, i) => {
          const stockUnit = line.stock_unit || ingredients.find((ing) => ing.id === line.ingredient)?.unit || "unit";
          const lineCost = previewLineCost(line.quantity, line.unit, line.cost_per_unit, stockUnit);
          return (
          <div className="recipe-line" key={i}>
            <input className="input" value={line.name} onChange={(e) => updateLine(i, { name: e.target.value })} />
            <input
              className="input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={line.quantity}
              onChange={(e) => updateLine(i, { quantity: sanitizeOmrDecimalInput(e.target.value) })}
              onWheel={(e) => e.currentTarget.blur()}
            />
            <input className="input" value={line.unit} onChange={(e) => updateLine(i, { unit: e.target.value })} />
            <div className="recipe-line-cost">
              <input
                className="input"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={line.cost_per_unit}
                onChange={(e) => updateLine(i, { cost_per_unit: sanitizeOmrDecimalInput(e.target.value) })}
                onWheel={(e) => e.currentTarget.blur()}
              />
              <span className="hint">/ {stockUnit}</span>
            </div>
            <div className="recipe-line-preview hint">
              {lineCost != null ? formatMoney(lineCost) : "—"}
            </div>
            <button type="button" className="icon-btn" onClick={() => setForm((f) => ({ ...f, recipe_lines: f.recipe_lines.filter((_, idx) => idx !== i) }))}>✕</button>
          </div>
          );
        })}
        {form.recipe_lines.length === 0 && <div className="hint">No recipe ingredients added yet.</div>}

        <h3 style={{ marginTop: 20 }}>Pricing & Profit</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          Enter a selling price to see profit automatically, or enter a target profit % to get the recommended selling price.
          Cost comes from recipe ingredients above.
        </p>
        <div className="form-grid">
          <div className="field">
            <label>Cost per Serving</label>
            <div className="input" style={{ display: "flex", alignItems: "center", background: "#f9fafb" }}>
              {formatMoney(costPreview.costPerServing)}
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              Total recipe cost {formatMoney(costPreview.totalCost)} ÷ {form.servings || 1} serving{(form.servings || 1) === 1 ? "" : "s"}
            </div>
          </div>
          <div className="field">
            <label>Selling Price per Serving (OMR)</label>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={form.selling_price}
              onChange={(e) => onSellingPriceChange(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Target Profit Margin (%)</label>
            <input
              className="input"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 70"
              value={profitMargin}
              onChange={(e) => onProfitMarginChange(e.target.value)}
            />
            <div className="hint" style={{ marginTop: 6 }}>
              Selling price = cost ÷ (1 − margin%). Margin must be below 100%.
            </div>
          </div>
        </div>
        {costPreview.costPerServing <= 0 && (
          <div className="hint" style={{ marginTop: 8 }}>Add priced recipe ingredients to calculate profit.</div>
        )}
        {profitPreview && (
          <div className="profit-grid" style={{ marginTop: 16 }}>
            <div className="profit-box">
              <div className="k">Gross Profit / Serving</div>
              <div className="v">{formatMoney(profitPreview.gross)}</div>
            </div>
            <div className="profit-box">
              <div className="k">Profit Margin</div>
              <div className="v">{profitPreview.margin}%</div>
            </div>
            <div className="profit-box">
              <div className="k">Cost as % of Price</div>
              <div className={`v ${foodCostTone(profitPreview.foodCostPct)}`}>
                {profitPreview.foodCostPct}% · {foodCostLabel(profitPreview.foodCostPct)}
              </div>
            </div>
            <div className="profit-box">
              <div className="k">Selling Price</div>
              <div className="v">{formatMoney(profitPreview.sellingPrice)}</div>
            </div>
          </div>
        )}

        <h3 style={{ marginTop: 20 }}>Ratings</h3>
        <p className="hint" style={{ marginBottom: 12 }}>
          Ratings are calculated automatically from tasting committee evaluations (QR form). Manual star entry is no longer used.
        </p>
        {(form.taste || form.texture || form.cost || form.consistency || form.overall) ? (
          [
            { key: "taste", label: "Taste" },
            { key: "texture", label: "Texture" },
            { key: "cost", label: "Value" },
            { key: "consistency", label: "Consistency" },
            { key: "overall", label: "Overall" },
          ].map(({ key, label }) => (
            <div key={key} className="list-row">
              <span style={{ width: 120 }}>{label}</span>
              <Stars value={form[key]} />
            </div>
          ))
        ) : (
          <div className="hint">No committee ratings yet — share the trial QR for evaluations.</div>
        )}

        <h3 style={{ marginTop: 20 }}>Preparation Steps</h3>
        {form.prep_steps.map((s, i) => (
          <div className="step-row" key={i}>
            <span>{i + 1}</span>
            <textarea className="textarea" value={s.text} onChange={(e) => {
              const steps = [...form.prep_steps];
              steps[i] = { text: e.target.value };
              set("prep_steps", steps);
            }} />
            <button type="button" className="icon-btn" onClick={() => set("prep_steps", form.prep_steps.filter((_, idx) => idx !== i))}>✕</button>
          </div>
        ))}
        <button type="button" className="btn btn-ghost" onClick={() => set("prep_steps", [...form.prep_steps, { text: "" }])}>
          <Icon name="plus" />
          Add Step
        </button>
        {form.prep_steps.length === 0 && <div className="hint">No preparation steps added yet.</div>}

        <div className="field" style={{ marginTop: 16 }}>
          <label>Notes / Observations</label>
          <textarea className="textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
      )}
    </div>
  );
}

export function TrialDetail() {
  const { id } = useParams();
  const [trial, setTrial] = useState(null);
  const [scale, setScale] = useState(1);
  const [committee, setCommittee] = useState([]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("taste");
  const [notes, setNotes] = useState("");
  const [toast, setToast] = useState("");
  const [loadError, setLoadError] = useState("");

  const load = () => {
    setLoadError("");
    api.get(`/trials/${id}/`)
      .then((r) => {
        setTrial(r.data);
        setScale(r.data.servings || 1);
      })
      .catch(() => {
        setTrial(null);
        setLoadError("Trial not found or could not be loaded.");
      });
    api.get(`/trials/${id}/committee-ratings/`).then((r) => setCommittee(r.data));
  };
  useEffect(load, [id]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const approve = async () => {
    const { data } = await api.post(`/trials/${id}/approve/`);
    setTrial(data);
    showToast("Trial approved.");
  };

  const reject = async () => {
    const { data } = await api.post(`/trials/${id}/reject/`, {
      rejection_reason: reason,
      rejection_notes: notes,
    });
    setTrial(data);
    setRejecting(false);
    setNotes("");
    showToast("Trial rejected.");
  };

  const factor = useMemo(() => {
    if (!trial) return 1;
    return scale / (trial.servings || 1);
  }, [trial, scale]);

  if (loadError) {
    return (
      <div>
        <div className="empty">{loadError}</div>
        <Link className="btn btn-back" to="/trials" style={{ marginTop: 16 }}>Back to Meal Trials</Link>
      </div>
    );
  }

  if (!trial) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="hint"><Link to="/trials">Meal Trials</Link></div>
            <h1>Meal Trial</h1>
          </div>
        </div>
        <Skeleton count={6} height={56} />
      </div>
    );
  }

  const scores = trial.committee_scores || {};
  const radar = [
    { k: "Taste", v: Number(scores.taste ?? trial.taste) || 0 },
    { k: "Texture", v: Number(scores.texture ?? trial.texture) || 0 },
    { k: "Value", v: Number(scores.cost ?? trial.cost) || 0 },
    { k: "Consistency", v: Number(scores.consistency ?? trial.consistency) || 0 },
    { k: "Overall", v: Number(scores.overall ?? trial.overall) || 0 },
  ];
  const displayAvg = trial.committee_avg ?? trial.avg_rating ?? 0;
  const profit = trial.cost_summary?.profit;
  const foodPct = profit?.food_cost_pct != null ? Number(profit.food_cost_pct) : null;
  const evalUrl = `${window.location.origin}/evaluate/${trial.id}`;

  const CRITERIA = [
    { key: "taste", label: "Taste" },
    { key: "texture", label: "Texture" },
    { key: "cost", label: "Value" },
    { key: "consistency", label: "Consistency" },
    { key: "overall", label: "Overall" },
  ];

  const printRecipe = () => {
    const html = `<html><head><title>${trial.title}</title>
      <style>body{font-family:Segoe UI,sans-serif;padding:32px;color:#111}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}</style>
      </head><body>
      <h1>Successful Dish Recipe</h1>
      <p>${trial.code} · ${trial.title}</p>
      ${trial.cooking_temperature ? `<p>Temperature: ${trial.cooking_temperature}°C</p>` : ""}
      ${trial.cooking_duration ? `<p>Duration: ${trial.cooking_duration} min</p>` : ""}
      ${trial.expiry_amount ? `<p>Expires after: ${trial.expiry_amount} ${trial.expiry_unit} (from trial date)${trial.expiry_remaining_label ? ` — ${trial.expiry_remaining_label}` : ""}</p>` : ""}
      <h3>Ingredients</h3>
      <table><tr><th>Name</th><th>Qty</th><th>Unit</th></tr>
      ${trial.recipe_lines.map((l) => `<tr><td>${l.name}</td><td>${l.quantity}</td><td>${l.unit}</td></tr>`).join("")}
      </table>
      <h3>Preparation Steps</h3>
      <ol>${trial.prep_steps.map((s) => `<li>${s.text}</li>`).join("")}</ol>
      ${trial.notes ? `<h3>Notes</h3><p>${trial.notes}</p>` : ""}
      </body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.print();
  };

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}
      <div className="page-header">
        <div>
          <div className="hint"><Link to="/trials">Meal Trials</Link> / {trial.code}</div>
          <h1>{trial.title}</h1>
          <p>
            {trial.conducted_by} · {trial.trial_date} · Repetition #{trial.repetition_number}
            {trial.expiry_amount ? ` · Shelf life ${trial.expiry_amount} ${trial.expiry_unit}` : ""}
          </p>
        </div>
        <div className="page-header-actions">
          {canApproveTrial(trial) && (
            <button className="btn btn-primary" onClick={approve}><Icon name="check" /> Approve</button>
          )}
          {canRejectTrial(trial) && (
            <button className="btn btn-danger" onClick={() => setRejecting(true)}><Icon name="reject" /> Reject</button>
          )}
          <button className="btn btn-ghost" onClick={printRecipe}><Icon name="printer" /> Print Recipe</button>
          <Link className="btn btn-gold" to={`/trials/${id}/edit`}><Icon name="edit" /> Edit Trial</Link>
        </div>
      </div>

      {(trial.final_dish_photo || trial.photo) && (
        <img
          className="trial-hero-photo"
          src={trial.final_dish_photo || trial.photo}
          alt={trial.title}
        />
      )}

      <div className="stats-grid">
        <div className="stat-card ok"><div className="label">Success Rate</div><div className="value">{trial.success_rate}%</div></div>
        <div className="stat-card"><div className="label">Decision</div><div className="value" style={{ fontSize: 16, marginTop: 10 }}><StatusBadge value={trial.verdict} kind="verdict" /></div></div>
        <div className="stat-card"><div className="label">Cost / Serving</div><div className="value" style={{ fontSize: 18 }}>{formatMoney(trial.cost_summary?.cost_per_serving)}</div></div>
        <div className="stat-card"><div className="label">Committee Ratings</div><div className="value">{trial.committee_count || 0}</div></div>
        <div className={`stat-card ${trial.expiry_status === "expired" ? "danger" : trial.expiry_status === "expiring_soon" ? "warn" : ""}`}>
          <div className="label">Expiry</div>
          <div className="value" style={{ fontSize: 16, marginTop: 10 }}>
            {trial.expiry_status ? <StatusBadge value={trial.expiry_status} kind="expiry" /> : "No expiry"}
          </div>
          {trial.expiry_remaining_label && <div className="hint">{trial.expiry_remaining_label}</div>}
        </div>
      </div>

      {trial.verdict === "not_suitable" && (trial.rejection_reason || trial.rejection_notes) && (
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          <strong>Rejection</strong>
          {trial.rejection_reason && <div>Reason: {trial.rejection_reason}</div>}
          {trial.rejection_notes && <div>{trial.rejection_notes}</div>}
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Recipe Scaling</h3>
          <div>
            Show quantities for
            <input className="input" type="number" min="1" value={scale} onChange={(e) => setScale(Number(e.target.value) || 1)} style={{ width: 80, marginLeft: 8 }} />
            servings
            <button className="btn btn-ghost" style={{ marginLeft: 8 }} onClick={() => setScale(trial.servings)}>Reset</button>
          </div>
        </div>
        <div className="hint">Scale factor: {factor.toFixed(2)} · Original {trial.servings} serving(s)</div>
        {trial.recipe_lines.length === 0 && <div className="empty">No cost data — link ingredients above</div>}
        <table className="data">
          <thead>
            <tr><th>Ingredient</th><th>Original</th><th>Scaled</th><th>Unit Price</th><th>Line Cost</th></tr>
          </thead>
          <tbody>
            {(trial.cost_summary?.lines || []).map((l) => (
              <tr key={l.id}>
                <td>{l.name}</td>
                <td>{l.quantity} {l.unit}</td>
                <td>{(Number(l.quantity) * factor).toFixed(2)} {l.unit}</td>
                <td>
                  {formatMoney(l.cost_per_unit)}
                  {l.stock_unit ? <span className="hint"> / {l.stock_unit}</span> : null}
                </td>
                <td>{formatMoney(Number(l.line_cost) * factor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p><strong>Estimated Total Cost:</strong> {formatMoney(Number(trial.cost_summary?.total_cost || 0) * factor)}</p>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <h3>Ratings</h3>
          <p className="hint">Based on tasting committee evaluations</p>
          {(trial.committee_count || 0) === 0 ? (
            <div className="empty">No committee ratings yet — share the QR code for evaluations.</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <Stars value={displayAvg} size={22} />
                <strong>{Number(displayAvg).toFixed(1)} / 5</strong>
                <span className="hint">avg from {trial.committee_count} evaluation{trial.committee_count === 1 ? "" : "s"}</span>
              </div>
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <RadarChart data={radar}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="k" />
                    <PolarRadiusAxis domain={[0, 5]} />
                    <Radar dataKey="v" stroke="#D9BD7D" fill="#D9BD7D" fillOpacity={0.4} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
        <div className="card card-pad">
          <h3>Committee QR Evaluation</h3>
          <p className="hint">Share this QR so tasting committee members can rate the dish.</p>
          <div style={{ background: "#fff", padding: 12, display: "inline-block", borderRadius: 8, border: "1px solid var(--border)" }}>
            <QRCodeSVG value={evalUrl} size={160} />
          </div>
          <div className="hint" style={{ marginTop: 8 }}>{evalUrl}</div>
          <p style={{ marginTop: 12 }}>
            Average committee score: {trial.committee_avg != null ? Number(trial.committee_avg).toFixed(1) : "—"}
          </p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Profitability Analysis</h3>
        {!trial.selling_price && <div className="empty">Enter selling price to view profitability analysis</div>}
        {trial.selling_price && trial.recipe_lines.length === 0 && <div className="empty">Add priced recipe ingredients to view analysis</div>}
        {profit && (
          <>
            <div className="profit-grid">
              <div className="profit-box"><div className="k">Ingredient Cost</div><div className="v">{formatMoney(trial.cost_summary.total_cost)}</div></div>
              <div className="profit-box"><div className="k">Cost per Serving</div><div className="v">{formatMoney(trial.cost_summary.cost_per_serving)}</div></div>
              <div className="profit-box"><div className="k">Gross Profit</div><div className="v">{formatMoney(profit.gross_profit)}</div></div>
              <div className="profit-box"><div className="k">Cost as % of Price</div><div className={`v ${foodCostTone(foodPct)}`}>{profit.food_cost_pct}% · {foodCostLabel(foodPct)}</div></div>
            </div>
            <p className="hint">Aim for cost under 30% of selling price · Profit margin {profit.profit_margin}%</p>
          </>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Preparation Steps</h3>
        {trial.prep_steps.length === 0 && <div className="empty">No preparation steps added yet.</div>}
        <ol>{trial.prep_steps.map((s) => <li key={s.id} style={{ marginBottom: 8 }}>{s.text}</li>)}</ol>
        {trial.notes && <><h3>Notes</h3><p>{trial.notes}</p></>}
      </div>

      <div className="card card-pad">
        <h3>Committee Evaluation</h3>
        {committee.length === 0 && <div className="empty">No committee ratings yet.</div>}
        {committee.map((c) => (
          <div className="committee-eval" key={c.id}>
            <div className="committee-eval-header">
              <div>
                <strong>{c.member_name}</strong>
                {c.submitted_at && (
                  <div className="hint">{formatDateTime(c.submitted_at)}</div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <Stars value={c.avg ?? c.overall} size={20} />
                <div className="hint">Avg {c.avg != null ? Number(c.avg).toFixed(1) : "—"} / 5</div>
              </div>
            </div>
            <div className="committee-eval-scores">
              {CRITERIA.map(({ key, label }) => (
                <div className="committee-eval-score" key={key}>
                  <span>{label}</span>
                  <Stars value={c[key]} />
                </div>
              ))}
            </div>
            {c.notes ? <div className="hint" style={{ marginTop: 8 }}>{c.notes}</div> : null}
          </div>
        ))}
      </div>

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
          <p>Reason for rejecting {trial.title}</p>
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
