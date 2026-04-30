import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { MainLayout } from "./components/layout/MainLayout";

const Dashboard = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })),
);

export function App() {
  return (
    <BrowserRouter>
      <Routes>
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
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
