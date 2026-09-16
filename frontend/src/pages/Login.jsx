import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(localStorage.getItem("lab_email") || "admin@lab.test");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(Boolean(localStorage.getItem("lab_email")));
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
    <div className="login-shell">
      <div className="login-wrap">
        <div className="login-card">
          <div className="login-header">
            <img src="/maa-logo.png" alt="MAA" />
            <h1>Ingredient & Meal Trial Lab</h1>
            <p>Test. Taste. Trust.</p>
          </div>
          <form className="login-form" onSubmit={onSubmit}>
            {error && <div className="login-error">{error}</div>}
            <div className="field">
              <label>Email Address</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <label className="remember">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
            <button className="btn btn-primary" type="submit" disabled={loading}>
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
    </div>
  );
}
