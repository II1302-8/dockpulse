import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { components } from "../api-types";
import { apiFetch, onLoggedOut } from "./api";

// regenerated via `bun run gen:api`
export type AuthUser = components["schemas"]["UserOut"];

export type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  // start true so first render doesn't flash logged-out before /me resolves
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // let apiFetch rotate on 401 so a 15-min access expiry doesn't bounce the user
      const res = await apiFetch("/api/auth/me");
      if (res.status === 401) {
        setUser(null);
        return;
      }
      if (!res.ok) throw new Error(`/me ${res.status}`);
      const data = (await res.json()) as AuthUser;
      setUser(data);
    } catch (err) {
      console.error("auth refresh failed", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      // backend logout reads refresh cookie directly, no access rotation needed
      await apiFetch("/api/auth/logout", {
        method: "POST",
        skipAuthRefresh: true,
      });
    } catch (err) {
      console.warn("logout request failed", err);
    } finally {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => onLoggedOut(() => setUser(null)), []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
