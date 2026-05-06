import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiFetch, onLoggedOut } from "./api";

export type AuthUser = {
  user_id?: string;
  email: string;
  firstname?: string;
  lastname?: string;
  phone?: string;
  boat_club?: string;
  role?: string;
  assigned_berth_id?: string | null;
};

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
      const res = await apiFetch("/api/auth/me", { skipAuthRefresh: true });
      if (res.status === 401) {
        setUser(null);
        return;
      }
      if (!res.ok) throw new Error(`/me ${res.status}`);
      const data = (await res.json()) as AuthUser;
      setUser(data);
    } catch (err) {
      // transient network error keeps last-known state, don't drop session
      console.error("auth refresh failed", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
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
