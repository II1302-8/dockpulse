import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  buildAuthContext,
  errorResponse,
  jsonResponse,
  makeBerth,
  makeUser,
  mockFetch,
} from "../test/helpers";

vi.mock("../svgMap", () => ({
  SvgMap: ({ onBerthClickCB }: { onBerthClickCB?: (id: string) => void }) => (
    <button
      type="button"
      data-testid="svg-map"
      onClick={() => onBerthClickCB?.("B1")}
    >
      svg
    </button>
  ),
}));

vi.mock("../svg", () => ({
  mapBerthIds: new Set(["B1", "B2"]),
  berthSlots: {},
}));

import { DashboardLayoutProvider } from "../components/layout/DashboardLayoutContext";
import { HarborMap } from "../HarborMap";

function renderHarborMap(
  authOverrides: Parameters<typeof buildAuthContext>[0] = {},
) {
  const ctx = buildAuthContext(authOverrides);
  return render(
    <MemoryRouter initialEntries={["/saltsjobaden"]}>
      <DashboardLayoutProvider userRole={authOverrides.user?.role}>
        <Routes>
          <Route path="/:marinaSlug" element={<Outlet context={ctx} />}>
            <Route index element={<HarborMap />} />
          </Route>
        </Routes>
      </DashboardLayoutProvider>
    </MemoryRouter>,
  );
}

describe("HarborMap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("visitor view renders HarborOverview with snapshot data", async () => {
    mockFetch(() => jsonResponse([makeBerth({ berth_id: "B1" })]));
    renderHarborMap();
    expect(await screen.findByText("Harbor Overview")).toBeInTheDocument();
  });

  test("harbormaster view renders Harbor Master HUD", async () => {
    mockFetch(() => jsonResponse([makeBerth({ berth_id: "B1" })]));
    renderHarborMap({ user: makeUser({ role: "harbormaster" }) });
    expect(await screen.findByText("Harbor Master HUD")).toBeInTheDocument();
  });

  test("clicking a berth opens the detail panel", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/berths"))
        return jsonResponse([makeBerth({ berth_id: "B1" })]);
      if (url.includes("/api/berths/B1"))
        return jsonResponse(makeBerth({ berth_id: "B1", label: "1" }));
      return errorResponse(404);
    });
    const user = userEvent.setup();
    renderHarborMap({ user: makeUser({ role: "boat_owner" }) });
    await user.click(await screen.findByTestId("svg-map"));
    await waitFor(() =>
      expect(screen.getByText("Berth Detail")).toBeInTheDocument(),
    );
  });
});
