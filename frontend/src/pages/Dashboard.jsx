import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/client";
import StatusBadge from "../components/StatusBadge";
import Stars from "../components/Stars";
import { formatDateTime } from "../utils/format";

const PIE_COLORS = ["#3F6B5C", "#EF4444", "#D9BD7D"];

function formatChartDay(iso) {
  if (!iso) return "";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard/")
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load dashboard."));
  }, []);

  if (error) return <div className="empty">{error}</div>;
  if (!data) return <div className="empty">Loading…</div>;

  const pieData = [
    { name: "Approved", value: data.verdict_breakdown.suitable },
    { name: "Rejected", value: data.verdict_breakdown.not_suitable },
    { name: "Pending", value: data.verdict_breakdown.pending || 0 },
    { name: "Emergency Substitute", value: data.verdict_breakdown.emergency_substitute },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Central kitchen R&amp;D overview</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Ingredients</div>
          <div className="value">{data.totals.ingredients}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Suppliers</div>
          <div className="value">{data.totals.suppliers}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Trials</div>
          <div className="value">{data.totals.trials}</div>
        </div>
        <div className="stat-card warn">
          <div className="label">Trials Expiring Soon</div>
          <div className="value">{data.totals.expiring_trials || 0}</div>
        </div>
        <div className="stat-card ok">
          <div className="label">Overall Success Rate</div>
          <div className="value">{data.totals.success_rate}%</div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Approved &amp; Rejected Trials per Day</h3>
        <p className="hint">Last 30 days by trial date</p>
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={(data.verdicts_over_time || []).map((row) => ({ ...row, label: formatChartDay(row.date) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} />
              <Tooltip
                labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ""}
                formatter={(value, name) => [value, name === "approved" ? "Approved" : "Rejected"]}
              />
              <Legend
                formatter={(value) => (value === "approved" ? "Approved" : "Rejected")}
              />
              <Line
                type="monotone"
                dataKey="approved"
                name="approved"
                stroke="#16a34a"
                strokeWidth={2}
                dot={{ r: 3, fill: "#16a34a" }}
              />
              <Line
                type="monotone"
                dataKey="rejected"
                name="rejected"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3, fill: "#ef4444" }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <h3>Trials Over Time</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={data.trials_over_time}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#D9BD7D" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card card-pad">
          <h3>Decision Breakdown</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                  {pieData.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          <h3>Trial Duration</h3>
          <p className="hint">Cooking time for each trial (minutes)</p>
          {(data.trial_durations || []).length === 0 && (
            <div className="empty">No trials with recorded durations yet.</div>
          )}
          {(data.trial_durations || []).length > 0 && (
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <LineChart data={data.trial_durations}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="code" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} unit=" min" />
                  <Tooltip
                    formatter={(value) => (value == null ? "Not recorded" : `${value} min`)}
                    labelFormatter={(_, payload) => {
                      const row = payload?.[0]?.payload;
                      return row ? `${row.title} (${row.trial_date || "—"})` : "";
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="duration_minutes"
                    stroke="#3F6B5C"
                    strokeWidth={2}
                    dot={{ r: 4, fill: "#3F6B5C" }}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="card card-pad">
          <h3>Success Rate by Category</h3>
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={data.success_by_category}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="success_rate" fill="#3F6B5C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card card-pad">
          <h3>Low Stock Items</h3>
          {data.low_stock.length === 0 && <div className="empty">No items below par level.</div>}
          {data.low_stock.map((i) => (
            <div className="list-row" key={i.id}>
              <div>
                <strong>{i.name}</strong>
                <div className="hint">{i.code} · {i.quantity} {i.unit} / par {i.par_level}</div>
              </div>
              <span className="badge badge-low">Low Stock</span>
            </div>
          ))}
          {data.low_stock.length > 0 && (
            <p className="hint">Below par level — reorder needed</p>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <h3>Expiring Soon</h3>
          <p className="hint">Trials that expire within 10 days, based on each trial’s shelf life</p>
          {(data.expiring_trials || []).length === 0 && (
            <div className="empty">No trials expired or expiring soon.</div>
          )}
          {(data.expiring_trials || []).map((t) => (
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
          ))}
        </div>
        <div className="card card-pad">
          <h3>Recent Trials</h3>
          {data.recent_trials.map((t) => (
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
          ))}
        </div>
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3>Products</h3>
        {data.top_rated.length === 0 && <div className="empty">No products yet.</div>}
        {data.top_rated.map((p) => (
          <div className="list-row" key={p.id}>
            <div>
              <Link to={`/products/${p.id}`}><strong>{p.product_name}</strong></Link>
              <div className="hint">
                {(p.ingredient_titles || []).length} linked ingredient{(p.ingredient_titles || []).length === 1 ? "" : "s"}
                {Number(p.avg_success_rate) > 0 ? ` · ${Number(p.avg_success_rate).toFixed(1)}% success` : ""}
              </div>
            </div>
            <Stars value={p.avg_rating} />
          </div>
        ))}
      </div>
    </div>
  );
}
