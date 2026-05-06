import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { DashboardLayoutProvider } from "../components/layout/DashboardLayoutContext";
import type { AuthOutletContext } from "../components/layout/MainLayout";
import { Dashboard } from "../pages/Dashboard";

// MainLayout normally supplies the outlet context + dashboard layout provider.
// smoke test re-creates the minimum shell so Dashboard can render without auth.
const anonymousOutletContext: AuthOutletContext = {
  user: null,
  isLoginOpen: false,
  setIsLoginOpen: () => {},
};

function OutletShell() {
  return (
    <DashboardLayoutProvider>
      <Outlet context={anonymousOutletContext} />
    </DashboardLayoutProvider>
  );
}

describe("Dashboard", () => {
  test("renders dashboard view using Prism mock API", async () => {
    render(
      <MemoryRouter initialEntries={["/saltsjobaden"]}>
        <Routes>
          <Route path="/:marinaSlug" element={<OutletShell />}>
            <Route index element={<Dashboard />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Harbor Overview")).toBeInTheDocument();
  });
});
