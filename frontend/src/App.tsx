import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";
import { RequireAuth } from "./components/RequireAuth";
import { AuthProvider } from "./lib/auth-context";

const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);

const Settings = lazy(() =>
  import("./pages/Settings").then((m) => ({ default: m.Settings })),
);

// cf access gates admin host at the edge so no in-app auth needed
const AdminApp = lazy(() =>
  import("./admin/AdminApp").then((m) => ({ default: m.AdminApp })),
);

// hostname fork avoids needing a second build target or tunnel-side rewrite
// admin.* serves only the panel, public routes unreachable on that host
const isAdminHost =
  typeof window !== "undefined" &&
  window.location.hostname.startsWith("admin.");

export function App() {
  if (isAdminHost) {
    return (
      <BrowserRouter>
        <Suspense fallback={<div className="h-full w-full" />}>
          <AdminApp />
        </Suspense>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* /admin path on non-admin hosts so localhost:5173/admin works */}
          <Route
            path="/admin/*"
            element={
              <Suspense fallback={<div className="h-full w-full" />}>
                <AdminApp />
              </Suspense>
            }
          />

          <Route path="/" element={<Navigate to="/saltsjobaden" replace />} />

          <Route path="/:marinaSlug" element={<MainLayout />}>
            <Route
              index
              element={
                <Suspense fallback={<div className="h-full w-full" />}>
                  <Dashboard />
                </Suspense>
              }
            />

            <Route
              path="settings"
              element={
                <RequireAuth>
                  <Suspense fallback={<div className="h-full w-full" />}>
                    <Settings />
                  </Suspense>
                </RequireAuth>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
