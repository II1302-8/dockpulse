import type { ReactNode } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../lib/auth-context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { marinaSlug } = useParams<{ marinaSlug: string }>();

  // first paint waits for /me to resolve so we don't flash a redirect before state lands
  if (loading) {
    return <div className="h-full w-full" />;
  }
  if (!user) {
    const target = marinaSlug ? `/${marinaSlug}?login=1` : "/?login=1";
    return <Navigate to={target} replace />;
  }
  return <>{children}</>;
}
