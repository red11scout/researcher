import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

interface AuthContextType {
  isAuthenticated: boolean;
  isAdmin: boolean;
  adminAvailable: boolean;
  isLoading: boolean;
  login: (password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  adminLogin: (password: string) => Promise<{ success: boolean; message?: string }>;
  adminLogout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminAvailable, setAdminAvailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/status", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setIsAuthenticated(!!data.authenticated);
        setIsAdmin(!!data.isAdmin);
        setAdminAvailable(!!data.adminAvailable);
      })
      .catch(() => {
        setIsAuthenticated(false);
        setIsAdmin(false);
        setAdminAvailable(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (password: string) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      setIsAuthenticated(true);
      return { success: true };
    }
    return { success: false, message: data.message || "Invalid password" };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    setIsAuthenticated(false);
    setIsAdmin(false);
  }, []);

  const adminLogin = useCallback(async (password: string) => {
    const res = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    });
    let data: { success?: boolean; message?: string } = {};
    try {
      data = await res.json();
    } catch {
      // Ignore JSON parse errors and fall through to the generic message.
    }
    if (res.ok && data.success) {
      setIsAdmin(true);
      return { success: true };
    }
    return {
      success: false,
      message: data.message || "Invalid admin password",
    };
  }, []);

  const adminLogout = useCallback(async () => {
    await fetch("/api/auth/admin-logout", {
      method: "POST",
      credentials: "include",
    });
    setIsAdmin(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isAdmin,
        adminAvailable,
        isLoading,
        login,
        logout,
        adminLogin,
        adminLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
