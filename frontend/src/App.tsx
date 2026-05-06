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

// admin SPA — gated by CF Access at the edge, no in-app auth
const AdminApp = lazy(() =>
  import("./admin/AdminApp").then((m) => ({ default: m.AdminApp })),
);

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
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
