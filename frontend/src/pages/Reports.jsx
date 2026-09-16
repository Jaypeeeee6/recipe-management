import { useEffect, useState } from "react";
import api from "../api/client";
import StatusBadge from "../components/StatusBadge";
import { verdictLabel } from "../utils/format";

export default function Reports() {
  const [categories, setCategories] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [filters, setFilters] = useState({ from: "", to: "", category: "", supplier: "", verdict: "" });
  const [report, setReport] = useState(null);

  useEffect(() => {
    api.get("/categories/").then((r) => setCategories(r.data));
    api.get("/suppliers/").then((r) => setSuppliers(r.data));
  }, []);

  const generate = () => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    api.get(`/reports/?${q}`).then((r) => setReport(r.data));
  };

  const exportCSV = () => {
    if (!report) return;
      const header = ["Trial", "Date", "Conducted By", "Ingredients", "Success", "Verdict", "Expiry", "Rating", "Notes"];
      const rows = report.rows.map((r) => [
        r.title, r.date, r.conducted_by, (r.ingredients || []).join("; "), r.success_rate, verdictLabel(r.verdict), r.expiry_remaining_label || "", r.rating, (r.notes || "").replaceAll("\n", " "),
      ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lab-report.csv";
    a.click();
  };

  const exportPDF = () => {
    if (!report) return;
    const html = `<html><head><title>Lab Report</title>
      <style>body{font-family:Segoe UI,sans-serif;padding:24px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:6px;text-align:left}h1{margin:0 0 12px}</style></head>
      <body><h1>Ingredient Lab Report</h1>
      <p>Total trials: ${report.summary.total_trials} · Avg success: ${report.summary.avg_success_rate}% · Approved: ${report.summary.suitable}</p>
      <table><tr><th>Trial</th><th>Date</th><th>By</th><th>Success</th><th>Decision</th><th>Rating</th></tr>
      ${report.rows.map((r) => `<tr><td>${r.title}</td><td>${r.date || ""}</td><td>${r.conducted_by}</td><td>${r.success_rate}%</td><td>${verdictLabel(r.verdict)}</td><td>${r.rating}</td></tr>`).join("")}
      </table></body></html>`;
    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    w.print();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Filter trials and export results</p>
        </div>
      </div>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="field"><label>From Date</label><input className="input" type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
          <div className="field"><label>To Date</label><input className="input" type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
          <div className="field">
            <label>Category</label>
            <select className="select" value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
              <option value="">All</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Supplier</label>
            <select className="select" value={filters.supplier} onChange={(e) => setFilters({ ...filters, supplier: e.target.value })}>
              <option value="">All</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.company_name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Decision</label>
            <select className="select" value={filters.verdict} onChange={(e) => setFilters({ ...filters, verdict: e.target.value })}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="suitable">Approved</option>
              <option value="not_suitable">Rejected</option>
              <option value="emergency_substitute">Emergency Substitute</option>
            </select>
          </div>
        </div>
        <div className="page-header-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-primary" onClick={generate}>Generate Report</button>
          <button className="btn btn-gold" disabled={!report} onClick={exportPDF}>Export PDF</button>
          <button className="btn btn-ghost" disabled={!report} onClick={exportCSV}>Export CSV</button>
        </div>
      </div>

      {report && (
        <>
          <div className="stats-grid">
            <div className="stat-card"><div className="label">Total Trials</div><div className="value">{report.summary.total_trials}</div></div>
            <div className="stat-card ok"><div className="label">Avg Success Rate</div><div className="value">{report.summary.avg_success_rate}%</div></div>
            <div className="stat-card"><div className="label">Approved</div><div className="value">{report.summary.suitable}</div></div>
          </div>
          <div className="card">
            {report.rows.length === 0 && <div className="empty">No data matches the selected filters.</div>}
            <table className="data">
              <thead>
                <tr>
                  <th>Trial</th><th>Date</th><th>Conducted By</th><th>Ingredients</th><th>Success</th><th>Decision</th><th>Expiry</th><th>Rating</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.title}</td>
                    <td>{r.date}</td>
                    <td>{r.conducted_by}</td>
                    <td>{(r.ingredients || []).join(", ")}</td>
                    <td>{r.success_rate}%</td>
                    <td><StatusBadge value={r.verdict} kind="verdict" /></td>
                    <td>{r.expiry_remaining_label || "—"}</td>
                    <td>{r.rating}</td>
                    <td>{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
