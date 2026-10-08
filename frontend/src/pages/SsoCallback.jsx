import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export default function SsoCallback() {
  const { acceptSsoTokens } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const access = params.get("access");
    const refresh = params.get("refresh");
    if (!access || !refresh) {
      setError("Missing SSO tokens. Open Recipe Lab from the App Portal.");
      return;
    }
    acceptSsoTokens(access, refresh)
      .then(() => navigate("/", { replace: true }))
      .catch(() => setError("Could not complete portal sign-in."));
  }, [acceptSsoTokens, navigate]);

  if (error) {
    return (
      <div className="login-page-shell">
        <div className="login-card">
          <p className="login-error">{error}</p>
          <a href={import.meta.env.VITE_PORTAL_URL || "http://localhost:5050/login"}>
            Back to App Portal
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page-shell">
      <div className="login-card">
        <p>Signing you in…</p>
      </div>
    </div>
  );
}
