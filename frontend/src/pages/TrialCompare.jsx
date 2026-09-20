import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../api/client";
import Icon from "../components/Icon";
import Skeleton from "../components/Skeleton";
import StatusBadge from "../components/StatusBadge";
import Stars from "../components/Stars";
import { formatMoney, formatDate } from "../utils/format";

const MAX_COMPARE = 4;

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Color each value: green = best, red = worst (among selected). */
function compareTones(values, preferHigher) {
  const nums = values.map(num);
  const valid = nums.filter((n) => n != null);
  if (valid.length < 2) return values.map(() => "");
  const best = preferHigher ? Math.max(...valid) : Math.min(...valid);
  const worst = preferHigher ? Math.min(...valid) : Math.max(...valid);
  if (best === worst) return values.map(() => "cmp-tie");
  return nums.map((n) => {
    if (n == null) return "";
    if (n === best) return "cmp-better";
    if (n === worst) return "cmp-worse";
    return "cmp-mid";
  });
}

function metricValue(trial, key) {
  const scores = trial.committee_scores || {};
  const profit = trial.cost_summary?.profit;
  const costPerServing = num(trial.cost_summary?.cost_per_serving);
  switch (key) {
    case "success_rate":
      return num(trial.success_rate);
    case "avg_rating":
      return num(trial.committee_avg ?? trial.avg_rating);
    case "taste":
      return num(scores.taste ?? trial.taste);
    case "texture":
      return num(scores.texture ?? trial.texture);
    case "value":
      return num(scores.cost ?? trial.cost);
    case "consistency":
      return num(scores.consistency ?? trial.consistency);
    case "overall":
      return num(scores.overall ?? trial.overall);
    case "committee_count":
      return num(trial.committee_count) ?? 0;
    case "cost_per_serving":
      return costPerServing;
    case "selling_price":
      return num(trial.selling_price);
    case "gross_profit":
      return profit ? num(profit.gross_profit) : null;
    case "profit_margin":
      return profit ? num(profit.profit_margin) : null;
    case "cost_of_price":
      return profit ? num(profit.food_cost_pct) : null;
    default:
      return null;
  }
}

const METRICS = [
  { key: "success_rate", label: "Success Rate", preferHigher: true, format: (v) => (v == null ? "—" : `${v}%`) },
  { key: "avg_rating", label: "Avg Committee Rating", preferHigher: true, format: (v) => (v == null ? "—" : Number(v).toFixed(1)), stars: true },
  { key: "taste", label: "Taste", preferHigher: true, format: (v) => (v == null || !v ? "—" : Number(v).toFixed(1)), stars: true },
  { key: "texture", label: "Texture", preferHigher: true, format: (v) => (v == null || !v ? "—" : Number(v).toFixed(1)), stars: true },
  { key: "value", label: "Value", preferHigher: true, format: (v) => (v == null || !v ? "—" : Number(v).toFixed(1)), stars: true },
  { key: "consistency", label: "Consistency", preferHigher: true, format: (v) => (v == null || !v ? "—" : Number(v).toFixed(1)), stars: true },
  { key: "overall", label: "Overall Rating", preferHigher: true, format: (v) => (v == null || !v ? "—" : Number(v).toFixed(1)), stars: true },
  { key: "committee_count", label: "Committee Evaluations", preferHigher: true, format: (v) => (v == null ? "—" : String(v)) },
  { key: "cost_per_serving", label: "Cost per Serving", preferHigher: false, format: (v) => (v == null ? "—" : formatMoney(v)) },
  { key: "selling_price", label: "Selling Price", preferHigher: true, format: (v) => (v == null ? "—" : formatMoney(v)) },
  { key: "gross_profit", label: "Gross Profit / Serving", preferHigher: true, format: (v) => (v == null ? "—" : formatMoney(v)) },
  { key: "profit_margin", label: "Profit Margin %", preferHigher: true, format: (v) => (v == null ? "—" : `${v}%`) },
  { key: "cost_of_price", label: "Cost as % of Price", preferHigher: false, format: (v) => (v == null ? "—" : `${v}%`) },
];

export default function TrialCompare() {
  const [params, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(() =>
    (params.get("ids") || "")
      .split(",")
      .map((x) => Number(x))
      .filter(Boolean)
  );
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.get("/trials/?archived=false").then((r) => setCatalog(r.data)).finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    setSearchParams(selected.length ? { ids: selected.join(",") } : {}, { replace: true });
  }, [selected, setSearchParams]);

  useEffect(() => {
    if (selected.length < 2) {
      setDetails([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(selected.map((id) => api.get(`/trials/${id}/`).then((r) => r.data)))
      .then((rows) => {
        if (!cancelled) setDetails(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const filteredCatalog = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return catalog;
    return catalog.filter((t) =>
      `${t.code} ${t.title} ${t.conducted_by}`.toLowerCase().includes(term)
    );
  }, [catalog, q]);

  const toggle = (id) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, id];
    });
  };

  const winnersByMetric = useMemo(() => {
    if (details.length < 2) return {};
    const map = {};
    for (const m of METRICS) {
      const values = details.map((t) => metricValue(t, m.key));
      const tones = compareTones(values, m.preferHigher);
      const bestIdx = tones.findIndex((t) => t === "cmp-better");
      if (bestIdx >= 0) map[m.key] = details[bestIdx].id;
    }
    return map;
  }, [details]);

  const winCounts = useMemo(() => {
    const counts = Object.fromEntries(details.map((t) => [t.id, 0]));
    Object.values(winnersByMetric).forEach((id) => {
      if (counts[id] != null) counts[id] += 1;
    });
    return counts;
  }, [details, winnersByMetric]);

  const overallBestId = useMemo(() => {
    const entries = Object.entries(winCounts);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    if (entries.length > 1 && entries[0][1] === entries[1][1]) return null;
    return Number(entries[0][0]);
  }, [winCounts]);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="hint"><Link to="/trials">Meal Trials</Link> / Compare</div>
          <h1>Compare Trials</h1>
          <p>Pick 2–{MAX_COMPARE} trials to see which performs better on each metric</p>
        </div>
        <Link className="btn btn-back" to="/trials">
          <Icon name="back" />
          Back
        </Link>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-4.3-4.3M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input
              placeholder="Search trials to compare…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <span className="hint">{selected.length} selected (max {MAX_COMPARE})</span>
          {selected.length > 0 && (
            <button type="button" className="btn btn-ghost" onClick={() => setSelected([])}>Clear</button>
          )}
        </div>
        <div className="compare-pick-grid">
          {catalogLoading ? (
            <Skeleton count={6} />
          ) : (
            <>
          {filteredCatalog.map((t) => {
            const checked = selected.includes(t.id);
            const disabled = !checked && selected.length >= MAX_COMPARE;
            return (
              <label key={t.id} className={`compare-pick ${checked ? "on" : ""} ${disabled ? "disabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(t.id)}
                />
                <div>
                  <strong>{t.code}</strong>
                  <div>{t.title}</div>
                  <div className="hint">{formatDate(t.trial_date)} · Success {t.success_rate}%</div>
                </div>
              </label>
            );
          })}
          {filteredCatalog.length === 0 && <div className="empty">No trials found.</div>}
            </>
          )}
        </div>
      </div>

      {selected.length < 2 && (
        <div className="empty">Select at least 2 trials to compare.</div>
      )}
      {loading && <Skeleton count={5} height={56} />}

      {!loading && details.length >= 2 && (
        <>
          <div className="compare-legend hint" style={{ marginBottom: 12 }}>
            <span className="cmp-better legend-swatch">Better</span>
            <span className="cmp-worse legend-swatch">Worse</span>
            <span className="cmp-tie legend-swatch">Tie</span>
            {overallBestId != null && (
              <span>
                Overall lead:{" "}
                <strong>{details.find((t) => t.id === overallBestId)?.code}</strong>
                {" "}({winCounts[overallBestId]} better metrics)
              </span>
            )}
          </div>

          <div className="card">
            <div className="table-wrap">
              <table className="data compare-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    {details.map((t) => (
                      <th key={t.id}>
                        <Link to={`/trials/${t.id}`}>{t.code}</Link>
                        <div className="hint">{t.title}</div>
                        {(t.final_dish_photo || t.photo) && (
                          <img className="compare-thumb" src={t.final_dish_photo || t.photo} alt="" />
                        )}
                        <div className="hint" style={{ marginTop: 6 }}>
                          Wins: {winCounts[t.id] || 0}
                          {overallBestId === t.id ? " · Best overall" : ""}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Decision</td>
                    {details.map((t) => (
                      <td key={t.id}><StatusBadge value={t.verdict} kind="verdict" /></td>
                    ))}
                  </tr>
                  {METRICS.map((m) => {
                    const values = details.map((t) => metricValue(t, m.key));
                    const tones = compareTones(values, m.preferHigher);
                    return (
                      <tr key={m.key}>
                        <td>
                          {m.label}
                          <div className="hint">{m.preferHigher ? "Higher is better" : "Lower is better"}</div>
                        </td>
                        {details.map((t, i) => (
                          <td key={t.id} className={`cmp-cell ${tones[i]}`}>
                            <div className="cmp-value">{m.format(values[i])}</div>
                            {m.stars && values[i] != null && values[i] > 0 && (
                              <Stars value={values[i]} size={14} />
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
