import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import api from "../api/client";
import Icon from "../components/Icon";
import Pagination, { usePagination } from "../components/Pagination";
import Skeleton from "../components/Skeleton";
import { useAuth } from "../auth/AuthContext";
import { canViewAudit } from "../utils/roles";
import { formatDateTime } from "../utils/format";

export default function AuditLogs() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set("search", q);
    if (action) params.set("action", action);
    api
      .get(`/audit-logs/?${params}`)
      .then((r) => {
        setItems(r.data);
        setError("");
      })
      .catch(() => setError("Could not load audit logs."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (canViewAudit(user)) load();
  }, [user]);

  const {
    page, setPage, pageItems, total, totalPages, from, to,
  } = usePagination(items, 15, `${q}|${action}|${items.length}`);

  if (!canViewAudit(user)) {
    return <Navigate to="/" replace />;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Audit Logs</h1>
          <p>Track who changed what across the lab system</p>
        </div>
        <Link className="btn btn-back" to="/settings">Settings</Link>
      </div>

      <div className="card">
        <div className="toolbar">
          <div className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-4.3-4.3M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input
              placeholder="Search summary, email, id…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </div>
          <select className="select" style={{ width: 180 }} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            <option value="login">Login</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
            <option value="clear_data">Clear data</option>
          </select>
          <button className="btn btn-ghost" onClick={load}><Icon name="refresh" /> Refresh</button>
        </div>

        {error && <div className="empty">{error}</div>}
        {loading && !error && <Skeleton count={6} />}
        {!loading && !error && items.length === 0 && <div className="empty">No audit events yet.</div>}

        {items.length > 0 && (
          <>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>When</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Summary</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDateTime(row.created_at)}</td>
                    <td>
                      {row.actor_name || "System"}
                      {row.actor_email ? <div className="hint">{row.actor_email}</div> : null}
                    </td>
                    <td style={{ textTransform: "capitalize" }}>{row.action}</td>
                    <td>
                      {row.entity_type || "—"}
                      {row.entity_id ? <div className="hint">#{row.entity_id}</div> : null}
                    </td>
                    <td>{row.summary || "—"}</td>
                    <td className="hint">{row.ip_address || "—"}</td>
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
