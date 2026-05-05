import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  errorResponse,
  jsonResponse,
  makeUser,
  mockFetch,
} from "../../test/helpers";
import { MainLayout } from "../layout/MainLayout";

vi.mock("sonner", async () => {
  return {
    Toaster: () => null,
    toast: { warning: vi.fn(), success: vi.fn() },
  };
});

function renderLayout(token: string | null = null) {
  if (token) localStorage.setItem("token", token);
  return render(
    <MemoryRouter initialEntries={["/saltsjobaden"]}>
      <Routes>
        <Route path="/:marinaSlug" element={<MainLayout />}>
          <Route index element={<div data-testid="page" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("MainLayout", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders Outlet content for current route", () => {
    mockFetch(() => errorResponse(404));
    renderLayout();
    expect(screen.getByTestId("page")).toBeInTheDocument();
  });

  test("loads /me when token is present", async () => {
    let calls = 0;
    mockFetch((url) => {
      if (url.endsWith("/api/users/me")) {
        calls += 1;
        return jsonResponse(makeUser({ firstname: "Olle" }));
      }
      return errorResponse(404);
    });
    renderLayout("tok");
    await waitFor(() => expect(calls).toBeGreaterThan(0));
  });

  test("401 on /me clears local session", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/users/me")) return errorResponse(401);
      return errorResponse(404);
    });
    renderLayout("tok");
    await waitFor(() => expect(localStorage.getItem("token")).toBeNull());
  });

  test("clicking login button opens AuthDialog", async () => {
    mockFetch(() => errorResponse(404));
    const user = userEvent.setup();
    renderLayout();
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByText(/welcome back/i)).toBeInTheDocument();
  });

  test("logout button clears token", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/api/users/me"))
        return jsonResponse(makeUser({ firstname: "Olle", lastname: "Owner" }));
      if (url.endsWith("/api/auth/logout") && init?.method === "POST")
        return jsonResponse({});
      return errorResponse(404);
    });
    const user = userEvent.setup();
    renderLayout("tok");
    await user.click(await screen.findByLabelText(/open user menu/i));
    await user.click(screen.getByRole("menuitem", { name: /log out/i }));
    await waitFor(() => expect(localStorage.getItem("token")).toBeNull());
  });
});
