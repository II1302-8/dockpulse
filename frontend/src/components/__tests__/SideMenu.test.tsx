import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { SideMenu } from "../layout/SideMenu";

function renderSideMenu(props: React.ComponentProps<typeof SideMenu>) {
  return render(
    <MemoryRouter initialEntries={["/saltsjobaden"]}>
      <Routes>
        <Route path="/:marinaSlug/*" element={<SideMenu {...props} />} />
      </Routes>
    </MemoryRouter>,
  );
}

const baseProps: React.ComponentProps<typeof SideMenu> = {
  isExpanded: false,
  onToggle: () => {},
  onOverviewToggle: () => {},
  onActivityLogToggle: () => {},
  isOverviewActive: false,
  isActivityLogActive: false,
};

describe("SideMenu", () => {
  test("toggle button fires onToggle", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    renderSideMenu({ ...baseProps, onToggle });
    // first nav button is the toggle (collapse/expand)
    const toggle = screen.getAllByRole("button")[0];
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalled();
  });

  test("overview menu items fire callbacks", async () => {
    const onOverviewToggle = vi.fn();
    const onActivityLogToggle = vi.fn();
    const user = userEvent.setup();
    renderSideMenu({ ...baseProps, onOverviewToggle, onActivityLogToggle });
    // mobile + desktop both render menuItems, so click counts double
    const overviewBtns = screen
      .getAllByRole("button")
      .filter((b) => b.textContent?.toLowerCase().includes("harbor overview"));
    expect(overviewBtns.length).toBeGreaterThan(0);
    await user.click(overviewBtns[0]);
    expect(onOverviewToggle).toHaveBeenCalled();
  });

  test("settings link points to current marina settings page", () => {
    renderSideMenu({ ...baseProps });
    const settingsLinks = screen.getAllByRole("link");
    expect(
      settingsLinks.some(
        (a) => a.getAttribute("href") === "/saltsjobaden/settings",
      ),
    ).toBe(true);
  });

  test("expanded state shows close-menu label", () => {
    renderSideMenu({ ...baseProps, isExpanded: true });
    expect(screen.getByText(/close menu/i)).toBeInTheDocument();
  });
});
