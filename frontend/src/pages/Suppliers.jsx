import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import api from "../api/client";
import Icon, { IconAction } from "../components/Icon";
import Skeleton from "../components/Skeleton";
import Stars from "../components/Stars";

const TYPES = [
  ["food", "Food & Ingredients"],
  ["equipment", "Equipment & Tools"],
  ["packaging", "Packaging"],
  ["services", "Services"],
  ["other", "Other"],
];

export function SupplierList() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);

  const load = () => api.get("/suppliers/").then((r) => setItems(r.data)).finally(() => setLoading(false));
  useEffect(() => {
    load();
    if (params.get("q")) setQ(params.get("q"));
  }, []);

  const filtered = items.filter((s) =>
    `${s.company_name} ${s.contact_person} ${s.city}`.toLowerCase().includes(q.toLowerCase())
  );

  const remove = async (s) => {
    if (!confirm("Are you sure you want to delete this supplier?")) return;
    await api.delete(`/suppliers/${s.id}/`);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Suppliers</h1>
          <p>Vendor directory for lab ingredients</p>
        </div>
        <Link className="btn btn-add" to="/suppliers/new"><Icon name="plus" /> Add Supplier</Link>
      </div>
      <div className="card">
        <div className="toolbar">
          <div className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 21l-4.3-4.3M10 18a8 8 0 100-16 8 8 0 000 16z" /></svg>
            <input placeholder="Search suppliers…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {loading ? (
          <Skeleton count={5} />
        ) : (
          <>
            {filtered.length === 0 && <div className="empty">No suppliers found.</div>}
            <div className="table-wrap">
              <table className="data">
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th>City</th>
                <th>Type</th>
                <th>Rating</th>
                <th>Ingredients</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/suppliers/${s.id}`}>{s.company_name}</Link></td>
                  <td>{s.contact_person}<div className="hint">{s.phone}</div></td>
                  <td>{s.city}, {s.country}</td>
                  <td style={{ textTransform: "capitalize" }}>{s.supplier_type}</td>
                  <td><Stars value={s.rating} /></td>
                  <td>{s.ingredient_count}</td>
                  <td className="row-actions">
                    <IconAction name="trash" title="Delete" tone="danger" onClick={() => remove(s)} />
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

export function SupplierForm() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [form, setForm] = useState({
    company_name: "",
    contact_person: "",
    phone: "",
    email: "",
    country: "",
    city: "",
    rating: 0,
    notes: "",
    supplier_type: "food",
  });
  const [loading, setLoading] = useState(!isNew);

  useEffect(() => {
    if (!isNew) api.get(`/suppliers/${id}/`).then((r) => setForm(r.data)).finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e) => {
    e.preventDefault();
    if (isNew) {
      const { data } = await api.post("/suppliers/", form);
      navigate(`/suppliers/${data.id}`);
    } else {
      await api.patch(`/suppliers/${id}/`, form);
      navigate("/suppliers");
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>{isNew ? "Add Supplier" : "Edit Supplier"}</h1>
        <Link className="btn btn-back" to="/suppliers">Back</Link>
      </div>
      {loading ? (
        <div className="card card-pad"><Skeleton count={6} height={36} /></div>
      ) : (
      <form className="card card-pad" onSubmit={save}>
        <div className="form-grid">
          <div className="field"><label>Company Name</label><input className="input" required value={form.company_name} onChange={(e) => set("company_name", e.target.value)} /></div>
          <div className="field"><label>Contact Person</label><input className="input" value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} /></div>
          <div className="field"><label>Phone</label><input className="input" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
          <div className="field"><label>Email</label><input className="input" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div className="field"><label>Country</label><input className="input" value={form.country} onChange={(e) => set("country", e.target.value)} /></div>
          <div className="field"><label>City</label><input className="input" value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
          <div className="field">
            <label>Supplier Type</label>
            <select className="select" value={form.supplier_type} onChange={(e) => set("supplier_type", e.target.value)}>
              {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Rating</label>
            <Stars value={form.rating} onChange={(v) => set("rating", v)} />
          </div>
          <div className="field full"><label>Notes</label><textarea className="textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
        </div>
        <div className="modal-actions">
          <Link className="btn btn-back" to="/suppliers">Cancel</Link>
          <button className="btn btn-primary">Save</button>
        </div>
      </form>
      )}
    </div>
  );
}
