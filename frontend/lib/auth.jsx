"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) return setLoading(false);
    api("/auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (login, password) => {
    const d = await api("/auth/login", { method: "POST", body: { login, password } });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  };

  const register = async (form) => {
    const d = await api("/auth/register", { method: "POST", body: form });
    setToken(d.token);
    setUser(d.user);
    return d.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export const isStaff = (user) => user?.role === "ADMIN" || user?.role === "EDITOR";
export const canTeach = (user) => user?.role === "ADMIN" || user?.role === "TEACHER";
export const ROLE_LABEL = { USER: "Student", EDITOR: "Editor", TEACHER: "Teacher", ADMIN: "Admin" };

/** Redirects to /login (or home, for users without the role) once auth has loaded. */
export function useRequireAuth({ admin = false, editor = false } = {}) {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) router.replace("/login");
    else if (admin && auth.user.role !== "ADMIN") router.replace("/");
    else if (editor && !isStaff(auth.user)) router.replace("/");
  }, [auth.loading, auth.user, admin, editor, router]);
  return auth;
}
