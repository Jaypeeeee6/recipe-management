import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import api from "../api/client";
import Modal from "../components/Modal";
import { canClearData, canManageUsers, canViewAudit, canWrite, roleLabel } from "../utils/roles";

const ROLES = [
  ["admin", "Admin — full access including secret ingredients"],
  ["staff", "Staff — full access except secret ingredients"],
  ["viewer", "Viewer — read-only"],
  ["it", "IT — secrets, audit logs, register & manage accounts"],
];

export default function Settings() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ display_name: "", email: "", role: "staff", password: "" });
  const [toast, setToast] = useState("");

  const load = () => {
    if (canManageUsers(user)) {
      api.get("/users/").then((r) => setUsers(r.data));
    }
    api.get("/categories/").then((r) => setCategories(r.data));
  };
  useEffect(load, [user]);

  const openNew = () => {
    setForm({ display_name: "", email: "", role: "staff", password: "" });
    setEditing("new");
  };
  const openEdit = (u) => {
    setForm({ display_name: u.display_name, email: u.email, role: u.role, password: "", id: u.id });
    setEditing("edit");
  };

  const saveUser = async () => {
    if (editing === "new") {
      await api.post("/users/", form);
    } else {
      await api.patch(`/users/${form.id}/`, form);
    }
    setEditing(null);
    load();
  };

  const deleteUser = async (u) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    await api.delete(`/users/${u.id}/`);
    load();
  };

  const addCategory = async () => {
    const name = prompt("Category name");
    if (!name) return;
    const prefix = prompt("Code prefix (e.g. SP)", name.slice(0, 2).toUpperCase());
    await api.post("/categories/", { name, code_prefix: prefix || "OT", sort_order: categories.length });
    load();
  };

  const clearData = async () => {
    if (!confirm("This will permanently delete ALL data and reset to seed. Are you sure?")) return;
    await api.post("/settings/clear-data/");
    setToast("Operational data cleared. Re-run seed_lab to restore demo data.");
  };

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Users, roles, categories, and system tools</p>
        </div>
        <div className="page-header-actions">
          {canViewAudit(user) && <Link className="btn btn-gold" to="/audit-logs">Audit Logs</Link>}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Role Permissions</h3>
        <div className="list-row"><strong>Admin</strong><span className="hint">Full lab access, secrets, and who may see each secret</span></div>
        <div className="list-row"><strong>Staff</strong><span className="hint">Can mark secrets; sees them only if Admin grants access</span></div>
        <div className="list-row"><strong>Viewer</strong><span className="hint">Read-only; sees secrets only if Admin grants access</span></div>
        <div className="list-row"><strong>IT</strong><span className="hint">Secrets, audit logs, and only role that can register/manage accounts</span></div>
      </div>

      {canManageUsers(user) && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="page-header" style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>User Management</h3>
            <button className="btn btn-primary" onClick={openNew}>Add User</button>
          </div>
          <table className="data">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.display_name}</td>
                  <td>{u.email}</td>
                  <td>{roleLabel(u.role)}</td>
                  <td>
                    <button className="btn btn-ghost" onClick={() => openEdit(u)}>Edit</button>
                    <button className="icon-btn" onClick={() => deleteUser(u)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="page-header" style={{ marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Categories</h3>
          {canWrite(user) && <button className="btn btn-ghost" onClick={addCategory}>Add</button>}
        </div>
        {categories.map((c) => (
          <div className="list-row" key={c.id}>
            <span>{c.name}</span>
            <span className="badge badge-gold">{c.code_prefix}</span>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <h3>Verdict Definitions</h3>
        <div className="list-row"><strong>Suitable</strong><span className="hint">Approved for production use</span></div>
        <div className="list-row"><strong>Not Suitable</strong><span className="hint">Failed tasting or cost criteria</span></div>
        <div className="list-row"><strong>Emergency Substitute</strong><span className="hint">Backup only — use if primary is unavailable</span></div>
      </div>

      {canClearData(user) && (
        <div className="card card-pad">
          <h3>Clear All Data</h3>
          <p className="hint">Permanently delete operational records. Users and categories are kept.</p>
          <button className="btn btn-danger" onClick={clearData}>Clear All Data</button>
        </div>
      )}

      {editing && (
        <Modal
          title={editing === "new" ? "Add User" : "Edit User"}
          onClose={() => setEditing(null)}
          actions={
            <>
              <button className="btn btn-back" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveUser}>Save</button>
            </>
          }
        >
          <div className="field"><label>Full Name</label><input className="input" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></div>
          <div className="field" style={{ marginTop: 10 }}><label>Email</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Role</label>
            <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginTop: 10 }}><label>Password</label><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        </Modal>
      )}
    </div>
  );
}
