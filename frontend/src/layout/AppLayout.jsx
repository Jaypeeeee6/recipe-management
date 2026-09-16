import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { roleLabel } from "../utils/roles";

function Icon({ d, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d={d} />
    </svg>
  );
}

const NAV = [
  { to: "/", label: "Dashboard", end: true, d: "M3 12l9-9 9 9M5 10v10h14V10" },
  { to: "/ingredients", label: "Ingredients", d: "M12 3v18M5 8h14M5 16h14" },
  { to: "/suppliers", label: "Suppliers", d: "M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6" },
  { to: "/trials", label: "Meal Trials", d: "M4 19h16M7 19V8m5 11V5m5 14v-7" },
  { to: "/products", label: "Products", d: "M12 17.3l6.18 3.7-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" },
  { to: "/reports", label: "Reports", d: "M4 19V5h16v14H4zm4-4h8M8 11h8" },
  { to: "/audit-logs", label: "Audit Logs", d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4", roles: ["admin", "it"] },
  { to: "/settings", label: "Settings", d: "M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" },
];

export default function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const onSearch = (e) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    if (location.pathname.startsWith("/suppliers")) navigate(`/suppliers?q=${encodeURIComponent(query)}`);
    else if (location.pathname.startsWith("/trials")) navigate(`/trials?q=${encodeURIComponent(query)}`);
    else navigate(`/ingredients?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="hamburger" onClick={() => setOpen(true)} aria-label="Open menu">
          <Icon d="M4 6h16M4 12h16M4 18h16" />
        </button>
        <NavLink to="/" className="brand-top">
          <img src="/maa-logo.png" alt="MAA" />
          <span>Ingredient Lab</span>
        </NavLink>
        <form className="topbar-search" onSubmit={onSearch}>
          <Icon d="M21 21l-4.3-4.3M10 18a8 8 0 100-16 8 8 0 000 16z" />
          <input
            type="text"
            placeholder="Search ingredients, trials, suppliers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </form>
        <div className="top-actions">
          <div className="user-pill">
            <div>
              <div className="user-name">{user?.display_name}</div>
            </div>
            <span className="role-badge">{roleLabel(user?.role)}</span>
          </div>
        </div>
      </header>

      <div className={`sidebar-overlay ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <nav className="nav">
          {NAV.filter((item) => !item.roles || item.roles.includes(user?.role)).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <Icon d={item.d} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            <Icon d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <div className="content page-enter">{children}</div>
      </div>
    </div>
  );
}
