import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const EYE_OFF = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
    <path d="m2 2 20 20" />
  </svg>
);

const EYE_ON = (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(localStorage.getItem("lab_email") || "");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(localStorage.getItem("lab_email")));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(email, password, remember);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-shell page-enter">
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-header">
            <img src="/maa-logo.png" alt="MAA logo" className="login-logo" />
            <h1>Recipe Management System</h1>
            <p className="login-subtitle">Sign in to your account</p>
          </div>

          <form className="login-form" onSubmit={onSubmit}>
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label className="form-label required" htmlFor="login-email">Email Address</label>
              <input
                id="login-email"
                className="form-input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label required" htmlFor="login-password">Password</label>
              <div className="password-field">
                <input
                  id="login-password"
                  className="form-input"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? EYE_ON : EYE_OFF}
                </button>
              </div>
            </div>

            <label className="remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>

            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <div className="login-demo">
              Demo accounts:<br />
              admin@lab.test / admin123<br />
              staff@lab.test / staff123<br />
              viewer@lab.test / viewer123<br />
              it@lab.test / it123
            </div>
          </form>
        </div>
      </div>
      <footer className="app-footer">
        © 2026 Recipe Management System. All rights reserved. Developed by IT Department, MAA Group.
      </footer>
    </div>
  );
}
