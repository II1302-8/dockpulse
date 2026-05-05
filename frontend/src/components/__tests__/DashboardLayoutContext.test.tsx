import { act, render, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import {
  DashboardLayoutProvider,
  useDashboardLayout,
} from "../layout/DashboardLayoutContext";

function wrap(userRole?: string) {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>
      <DashboardLayoutProvider userRole={userRole}>
        {children}
      </DashboardLayoutProvider>
    </MemoryRouter>
  );
}

describe("DashboardLayoutContext", () => {
  test("throws when used outside provider", () => {
    // suppress react error boundary noise
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useDashboardLayout())).toThrow(
      /must be used within a DashboardLayoutProvider/,
    );
    spy.mockRestore();
  });

  test("toggleOverview opens overview and closes activity log", () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrap(),
    });
    act(() => result.current.setIsActivityLogOpen(true));
    expect(result.current.isActivityLogOpen).toBe(true);
    act(() => result.current.toggleOverview());
    expect(result.current.isOverviewOpen).toBe(true);
    expect(result.current.isActivityLogOpen).toBe(false);
  });

  test("toggleActivityLog opens activity log and closes overview", () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrap(),
    });
    act(() => result.current.setIsOverviewOpen(true));
    act(() => result.current.toggleActivityLog());
    expect(result.current.isActivityLogOpen).toBe(true);
    expect(result.current.isOverviewOpen).toBe(false);
  });

  test("closeAllPanels resets both panels", () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrap(),
    });
    act(() => result.current.setIsOverviewOpen(true));
    act(() => result.current.setIsActivityLogOpen(true));
    act(() => result.current.closeAllPanels());
    expect(result.current.isOverviewOpen).toBe(false);
    expect(result.current.isActivityLogOpen).toBe(false);
  });

  test("sidebar offset depends on harbormaster role and expansion", () => {
    const { result, rerender } = renderHook(() => useDashboardLayout(), {
      wrapper: wrap("harbormaster"),
    });
    expect(result.current.sidebarOffset).toBe(112);
    act(() => result.current.setIsMenuExpanded(true));
    expect(result.current.sidebarOffset).toBe(288);
    rerender();
  });

  test("non-harbormaster always gets default offset", () => {
    const { result } = renderHook(() => useDashboardLayout(), {
      wrapper: wrap("boat_owner"),
    });
    expect(result.current.sidebarOffset).toBe(16);
  });

  test("provider renders children", () => {
    const { getByText } = render(
      <MemoryRouter>
        <DashboardLayoutProvider>
          <span>child</span>
        </DashboardLayoutProvider>
      </MemoryRouter>,
    );
    expect(getByText("child")).toBeInTheDocument();
  });
});

import { vi } from "vitest";
