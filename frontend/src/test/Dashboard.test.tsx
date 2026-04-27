import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test } from "vitest";
import Dashboard from "../pages/Dashboard";

describe("Dashboard", () => {
  test("renders dashboard view using Prism mock API", async () => {
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
