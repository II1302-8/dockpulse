import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { Header } from "../layout/Header";

interface Props extends React.ComponentProps<typeof Header> {
  route?: string;
}

function renderHeader({ route = "/saltsjobaden", ...props }: Props) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/:marinaSlug/*" element={<Header {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Header", () => {
  test("logged-out users see a login button that calls back", async () => {
    const onLogin = vi.fn();
    const user = userEvent.setup();
    renderHeader({
      isLoggedIn: false,
      onLoginClickCB: onLogin,
      onLogoutClickCB: vi.fn(),
    });
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect(onLogin).toHaveBeenCalled();
  });

  test("logged-in users get an avatar that opens a menu", async () => {
    const user = userEvent.setup();
    renderHeader({
      isLoggedIn: true,
      userInitials: "OO",
      onLoginClickCB: vi.fn(),
      onLogoutClickCB: vi.fn(),
    });
    await user.click(screen.getByLabelText(/open user menu/i));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /settings/i }),
    ).toBeInTheDocument();
  });

  test("Escape closes the user menu", async () => {
    const user = userEvent.setup();
    renderHeader({
      isLoggedIn: true,
      userInitials: "OO",
      onLoginClickCB: vi.fn(),
      onLogoutClickCB: vi.fn(),
    });
    await user.click(screen.getByLabelText(/open user menu/i));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("logout menuitem fires callback unless busy", async () => {
    const onLogout = vi.fn();
    const user = userEvent.setup();
    renderHeader({
      isLoggedIn: true,
      userInitials: "OO",
      onLoginClickCB: vi.fn(),
      onLogoutClickCB: onLogout,
    });
    await user.click(screen.getByLabelText(/open user menu/i));
    await user.click(screen.getByRole("menuitem", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalled();
  });

  test("clicking outside closes the user menu", async () => {
    const user = userEvent.setup();
    renderHeader({
      isLoggedIn: true,
      userInitials: "OO",
      onLoginClickCB: vi.fn(),
      onLogoutClickCB: vi.fn(),
    });
    await user.click(screen.getByLabelText(/open user menu/i));
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
