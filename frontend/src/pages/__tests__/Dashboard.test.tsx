import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { Dashboard } from "../Dashboard";

vi.mock("../../HarborMap", () => ({
  HarborMap: () => <div data-testid="harbor-map" />,
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/:marinaSlug" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Dashboard", () => {
  test("renders HarborMap inside the page wrapper", () => {
    const { getByTestId } = renderAt("/saltsjobaden");
    expect(getByTestId("harbor-map")).toBeInTheDocument();
  });

  test("sets document.title to known marina", () => {
    renderAt("/saltsjobaden");
    expect(document.title).toBe("Saltsjöbaden - Dashboard | DockPulse");
  });

  test("falls back to capitalized slug for unknown marina", () => {
    renderAt("/lidingo");
    expect(document.title).toBe("Lidingo - Dashboard | DockPulse");
  });
});
