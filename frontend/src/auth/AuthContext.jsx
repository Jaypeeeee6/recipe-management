import { createContext, useContext, useEffect, useMemo, useState } from "react";
import api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("lab_access");
    if (!token) {
      setReady(true);
      return;
    }
    api
      .get("/auth/me/")
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem("lab_access");
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const login = async (email, password, remember) => {
    const { data } = await api.post("/auth/login/", { email, password });
    localStorage.setItem("lab_access", data.access);
    localStorage.setItem("lab_refresh", data.refresh);
    if (remember) localStorage.setItem("lab_email", email);
    else localStorage.removeItem("lab_email");
    setUser(data.user);
    return data.user;
  };

  const acceptSsoTokens = async (access, refresh) => {
    localStorage.setItem("lab_access", access);
    localStorage.setItem("lab_refresh", refresh);
    const { data } = await api.get("/auth/me/");
    setUser(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem("lab_access");
    localStorage.removeItem("lab_refresh");
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, ready, login, logout, acceptSsoTokens }),
    [user, ready]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
