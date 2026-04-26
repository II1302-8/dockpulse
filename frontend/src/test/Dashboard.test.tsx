import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import Dashboard from "../pages/Dashboard";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    }),
  );
});

describe("Dashboard", () => {
  test("renders dashboard view", async () => {
    render(
      <MemoryRouter initialEntries={["/saltsjobaden"]}>
        <Routes>
          <Route path="/:marinaSlug" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Harbor Overview")).toBeInTheDocument();
  });
});