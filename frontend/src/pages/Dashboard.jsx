import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/client";
import StatusBadge from "../components/StatusBadge";
import Stars from "../components/Stars";
import Modal from "../components/Modal";
import Skeleton from "../components/Skeleton";
import { formatDate, formatDateTime } from "../utils/format";

const CURRENT_YEAR = new Date().getFullYear();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GRAINS = [
  { id: "year", label: "Year" },
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
];

function pad2(n) {
  return String(n).padStart(2, "0");
}

function mondayOf(d = new Date()) {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - offset);
  return day;
}

function toIsoDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function defaultPeriod(grain) {
  const now = new Date();
  if (grain === "year") return String(now.getFullYear());
  if (grain === "month") return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
  return toIsoDate(mondayOf(now));
}

function formatChartDay(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function formatAxisLabel(iso, grain) {
  if (!iso) return "";
  if (grain === "year") return MONTHS[Number(iso.slice(5, 7)) - 1] || iso;
  if (grain === "week") {
    const day = new Date(`${iso}T12:00:00`);
    return WEEKDAYS[day.getDay()];
  }
  return formatChartDay(iso);
}

function periodHint(grain, period, years, months, weeks) {
  if (grain === "year") {
    return String(period || CURRENT_YEAR);
  }
  const options = grain === "month" ? months : weeks;
  const match = (options || []).find((opt) => String(opt.value) === String(period));
  return match?.label || (grain === "month" ? "Selected month" : "Selected week");
}

function chartTitle(grain, kind) {
  if (kind === "verdicts") {
    return grain === "year" ? "Approved & Rejected Trials by Month" : "Approved & Rejected Trials per Day";
  }
  return "Trials Over Time";
}

function GrainToggle({ value, onChange, label }) {
  return (
    <div className="chart-grain" role="group" aria-label={label}>
      {GRAINS.map((grain) => (
        <button
          key={grain.id}
          type="button"
          className={`chart-grain-btn${value === grain.id ? " active" : ""}`}
          onClick={() => onChange(grain.id)}
        >
          {grain.label}
        </button>
      ))}
    </div>
  );
}

function SmoothAreaChart({ data, series, grain, unit }) {
  const showDots = grain !== "month";
  return (
    <ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 18, right: 12, left: -18, bottom: 0 }}>
        <defs>
          {series.map((item) => (
            <linearGradient key={item.key} id={`fill-${item.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={item.color} stopOpacity={0.42} />
              <stop offset="55%" stopColor={item.color} stopOpacity={0.14} />
              <stop offset="100%" stopColor={item.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid vertical={false} stroke="#f1f5f9" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "#9ca3af", fontWeight: 600 }}
          tickLine={false}
          axisLine={false}
          minTickGap={grain === "month" ? 28 : 8}
          interval={grain === "month" ? "preserveStartEnd" : 0}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11, fill: "#9ca3af" }}
          tickLine={false}
          axisLine={false}
          width={36}
          domain={[0, "auto"]}
        />
        <Tooltip
          cursor={{ stroke: "#e5e7eb", strokeWidth: 1 }}
          contentStyle={{ borderRadius: 10, border: "1px solid #e5e7eb", fontSize: 12 }}
          labelFormatter={(_, payload) => {
            const iso = payload?.[0]?.payload?.date;
            if (!iso) return "";
            return grain === "year" ? formatAxisLabel(iso, "year") : formatChartDay(iso);
          }}
          formatter={(value, name) => [unit ? `${value} ${unit}` : value, name]}
        />
        {series.length > 1 && <Legend iconType="line" />}
        {series.map((item) => (
          <Area
            key={item.key}
            type="monotone"
            dataKey={item.key}
            name={item.name}
            stroke={item.color}
            strokeWidth={3}
            fill={`url(#fill-${item.key})`}
            legendType="line"
            dot={showDots ? { r: 5, fill: item.color, stroke: "#fff", strokeWidth: 2 } : false}
            activeDot={{ r: 7, fill: item.color, stroke: "#fff", strokeWidth: 2 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function StatIcon({ name }) {
  const paths = {
    ingredients: "M3 10h18M5 10v10h14V10M8 10V6a4 4 0 018 0v4",
    suppliers: "M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6",
    trials: "M4 19h16M7 19V8m5 11V5m5 14v-7",
    expiring: "M12 8v5l3 2M12 22a10 10 0 100-20 10 10 0 000 20z",
    success: "M12 3l2.2 6.6H21l-5.4 4 2.1 6.4L12 16.8 6.3 20l2.1-6.4L3 9.6h6.8L12 3z",
  };
  return (
    <span className="stat-icon" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[name]} />
      </svg>
    </span>
  );
}

function PeriodSelect({ grain, value, years, months, weeks, onChange, label }) {
  let options = [];
  if (grain === "year") {
    options = (years?.length ? years : [CURRENT_YEAR]).map((year) => ({
      value: String(year),
      label: String(year),
    }));
  } else if (grain === "month") {
    options = months?.length
      ? months
      : [{ value: defaultPeriod("month"), label: MONTHS[new Date().getMonth()] }];
  } else {
    options = weeks?.length
      ? weeks
      : [{ value: defaultPeriod("week"), label: "This week" }];
  }

  const selected = options.some((opt) => String(opt.value) === String(value))
    ? String(value)
    : String(options[0]?.value ?? "");

  return (
    <select
      className="chart-year-select"
      aria-label={label}
      value={selected}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [verdictsGrain, setVerdictsGrain] = useState("week");
  const [trialsGrain, setTrialsGrain] = useState("week");
  const [verdictsPeriod, setVerdictsPeriod] = useState(() => defaultPeriod("week"));
  const [trialsPeriod, setTrialsPeriod] = useState(() => defaultPeriod("week"));
  const [expiringOpen, setExpiringOpen] = useState(false);

  useEffect(() => {
    api
      .get("/dashboard/", {
        params: {
          verdicts_grain: verdictsGrain,
          verdicts_period: verdictsPeriod,
          trials_grain: trialsGrain,
          trials_period: trialsPeriod,
        },
      })
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load dashboard."));
  }, [verdictsGrain, verdictsPeriod, trialsGrain, trialsPeriod]);

  const changeVerdictsGrain = (grain) => {
    setVerdictsGrain(grain);
    setVerdictsPeriod(defaultPeriod(grain));
  };
  const changeTrialsGrain = (grain) => {
    setTrialsGrain(grain);
    setTrialsPeriod(defaultPeriod(grain));
  };

  if (error) return <div className="empty">{error}</div>;

  const totals = data?.totals || {};
  const lowStock = data?.low_stock || [];
  const expiringTrials = data?.expiring_trials || [];
  const recentTrials = data?.recent_trials || [];
  const recentProducts = data?.recent_products || [];
  const verdictsChart = (data?.verdicts_over_time || []).map((row) => ({
    ...row,
    label: formatAxisLabel(row.date, verdictsGrain),
  }));
  const trialsChart = (data?.trials_over_time || []).map((row) => ({
    ...row,
    label: formatAxisLabel(row.date, trialsGrain),
  }));
  const durationChart = (data?.duration_by_week || []).map((row) => ({
    ...row,
    label: formatChartDay(row.date),
  }));
  const chartYears = data?.chart_years || [CURRENT_YEAR];
  const chartMonths = data?.chart_months || [];
  const chartWeeks = data?.chart_weeks || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Overview of recipes, trials, and ingredients</p>
        </div>
      </div>

      <div className="stats-grid dashboard-stats-grid">
        {!data ? (
          [0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton skeleton-stat" />)
        ) : (
          <>
            <div className="stat-card color-blue">
              <div>
                <div className="label">Total Ingredients</div>
                <div className="value">{totals.ingredients}</div>
              </div>
              <StatIcon name="ingredients" />
            </div>
            <div className="stat-card color-green">
              <div>
                <div className="label">Total Suppliers</div>
                <div className="value">{totals.suppliers}</div>
              </div>
              <StatIcon name="suppliers" />
            </div>
            <div className="stat-card color-purple">
              <div>
                <div className="label">Total Trials</div>
                <div className="value">{totals.trials}</div>
              </div>
              <StatIcon name="trials" />
            </div>
            <button
              type="button"
              className="stat-card color-red"
              onClick={() => setExpiringOpen(true)}
              aria-label="View trials expiring soon"
            >
              <div>
                <div className="label">Trials Expiring Soon</div>
                <div className="value">{totals.expiring_trials || 0}</div>
              </div>
              <StatIcon name="expiring" />
            </button>
            <div className="stat-card color-green">
              <div>
                <div className="label">Overall Success Rate</div>
                <div className="value">{totals.success_rate}%</div>
              </div>
              <StatIcon name="success" />
            </div>
          </>
        )}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="chart-header">
          <div>
            <h3>{chartTitle(verdictsGrain, "verdicts")}</h3>
            <p className="hint">{periodHint(verdictsGrain, verdictsPeriod, chartYears, chartMonths, chartWeeks)} · by trial date</p>
          </div>
          <div className="chart-header-actions">
            <GrainToggle
              label="Range for approved and rejected trials"
              value={verdictsGrain}
              onChange={changeVerdictsGrain}
            />
            <PeriodSelect
              label="Period for approved and rejected trials"
              grain={verdictsGrain}
              value={verdictsPeriod}
              years={chartYears}
              months={chartMonths}
              weeks={chartWeeks}
              onChange={setVerdictsPeriod}
            />
          </div>
        </div>
        <div style={{ height: 300 }}>
          {!data ? <div className="skeleton skeleton-chart" /> : (
          <SmoothAreaChart
            data={verdictsChart}
            grain={verdictsGrain}
            series={[
              { key: "approved", name: "Approved", color: "#22c55e" },
              { key: "rejected", name: "Rejected", color: "#ef4444" },
            ]}
          />
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="chart-header">
          <div>
            <h3>{chartTitle(trialsGrain, "trials")}</h3>
            <p className="hint">{periodHint(trialsGrain, trialsPeriod, chartYears, chartMonths, chartWeeks)}</p>
          </div>
          <div className="chart-header-actions">
            <GrainToggle
              label="Range for trials over time"
              value={trialsGrain}
              onChange={changeTrialsGrain}
            />
            <PeriodSelect
              label="Period for trials over time"
              grain={trialsGrain}
              value={trialsPeriod}
              years={chartYears}
              months={chartMonths}
              weeks={chartWeeks}
              onChange={setTrialsPeriod}
            />
          </div>
        </div>
        <div style={{ height: 260 }}>
          {!data ? <div className="skeleton skeleton-chart" /> : (
          <SmoothAreaChart
            data={trialsChart}
            grain={trialsGrain}
            series={[{ key: "count", name: "Trials", color: "#e2a01d" }]}
          />
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <h3>Trial Duration</h3>
          <p className="hint">Average cooking time by week</p>
          {!data ? (
            <div className="skeleton skeleton-chart" />
          ) : durationChart.length === 0 ? (
            <div className="empty">No trials with recorded durations yet.</div>
          ) : (
            <div style={{ height: 260 }}>
              <SmoothAreaChart
                data={durationChart}
                grain="year"
                unit="min"
                series={[{ key: "duration", name: "Minutes", color: "#3F6B5C" }]}
              />
            </div>
          )}
        </div>
        <div className="card card-pad">
          <h3>Low Stock Items</h3>
          {!data ? (
            <Skeleton count={3} />
          ) : lowStock.length === 0 ? (
            <div className="empty">No items below par level.</div>
          ) : (
            <>
              {lowStock.map((i) => (
                <div className="list-row" key={i.id}>
                  <div>
                    <strong>{i.name}</strong>
                    <div className="hint">{i.code} · {i.quantity} {i.unit} / par {i.par_level}</div>
                  </div>
                  <span className="badge badge-low">Low Stock</span>
                </div>
              ))}
              <p className="hint">Below par level — reorder needed</p>
            </>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <h3>Expiring Soon</h3>
          <p className="hint">Trials within 1 day or 5 hours of expiry, based on shelf life unit</p>
          {!data ? (
            <Skeleton count={3} />
          ) : expiringTrials.length === 0 ? (
            <div className="empty">No trials expiring soon.</div>
          ) : (
            expiringTrials.slice(0, 8).map((t) => (
              <div className="list-row" key={t.id}>
                <div>
                  <Link to={`/trials/${t.id}`}>{t.title}</Link>
                  <div className="hint">
                    {t.code} · {t.expiry_amount} {t.expiry_unit}
                    {t.expires_at ? ` · ${formatDateTime(t.expires_at)}` : ""}
                  </div>
                  <div className="hint">{t.expiry_remaining_label}</div>
                </div>
                <StatusBadge value={t.expiry_status} kind="expiry" />
              </div>
            ))
          )}
        </div>
        <div className="card card-pad">
          <h3>Recent Trials</h3>
          {!data ? (
            <Skeleton count={4} />
          ) : (
            recentTrials.map((t) => (
              <div className="list-row" key={t.id}>
                <div>
                  <Link to={`/trials/${t.id}`}>{t.title}</Link>
                  <div className="hint">{t.code} · {t.trial_date}{t.expiry_remaining_label ? ` · ${t.expiry_remaining_label}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {t.expiry_status && <StatusBadge value={t.expiry_status} kind="expiry" />}
                  <StatusBadge value={t.verdict} kind="verdict" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3>Recently Added Products</h3>
        {!data ? (
          <Skeleton count={3} />
        ) : recentProducts.length === 0 ? (
          <div className="empty">No products yet.</div>
        ) : recentProducts.map((p) => (
          <div className="list-row" key={p.id}>
            <div>
              <Link to={`/products/${p.id}`}><strong>{p.product_name}</strong></Link>
              <div className="hint">
                Added {formatDate(p.created_at)}
                {(p.ingredient_titles || []).length
                  ? ` · ${(p.ingredient_titles || []).length} linked ingredient${(p.ingredient_titles || []).length === 1 ? "" : "s"}`
                  : ""}
                {Number(p.avg_success_rate) > 0 ? ` · ${Number(p.avg_success_rate).toFixed(1)}% success` : ""}
              </div>
            </div>
            <Stars value={p.avg_rating} />
          </div>
        ))}
      </div>

      {expiringOpen && (
        <Modal
          wide
          title="Trials Expiring Soon"
          description="Trials within 1 day of expiry (day-based shelf life) or 5 hours of expiry (hour-based shelf life)."
          onClose={() => setExpiringOpen(false)}
          actions={<button type="button" className="btn btn-back" onClick={() => setExpiringOpen(false)}>Close</button>}
        >
          {expiringTrials.length === 0 ? (
            <div className="empty">No trials expiring soon.</div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Trial</th>
                    <th>Conducted By</th>
                    <th>Trial Date</th>
                    <th>Expires</th>
                    <th>Remaining</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringTrials.map((t) => (
                    <tr key={t.id} className="row-warn">
                      <td>{t.code}</td>
                      <td>
                        <Link to={`/trials/${t.id}`} onClick={() => setExpiringOpen(false)}>
                          {t.title}
                        </Link>
                      </td>
                      <td>{t.conducted_by || "—"}</td>
                      <td>{formatDate(t.trial_date)}</td>
                      <td>{formatDateTime(t.expires_at)}</td>
                      <td>{t.expiry_remaining_label || "—"}</td>
                      <td><StatusBadge value={t.expiry_status} kind="expiry" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
