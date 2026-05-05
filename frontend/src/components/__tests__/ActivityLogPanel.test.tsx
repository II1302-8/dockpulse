import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  jsonResponse,
  makeBerth,
  makeUser,
  mockFetch,
  renderWithAuthLayout,
} from "../../test/helpers";
import { ActivityLogPanel } from "../ActivityLogPanel";

type Berth = ReturnType<typeof makeBerth>;

describe("ActivityLogPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("shows empty state when no events", async () => {
    mockFetch(() => jsonResponse([]));
    renderWithAuthLayout(<ActivityLogPanel berths={[]} isOpen />, {
      auth: { user: makeUser({ role: "harbormaster" }), token: "t" },
    });
    expect(
      await screen.findByText(/waiting for activity/i),
    ).toBeInTheDocument();
  });

  test("hydrates events from per-user localStorage key", async () => {
    const user = makeUser({ user_id: "u123", role: "harbormaster" });
    localStorage.setItem(
      `dockpulse_activity_log:${user.user_id}`,
      JSON.stringify([
        {
          id: "e1",
          timestamp: new Date("2026-05-05T10:00:00Z").toISOString(),
          type: "status_change",
          berthId: "B1",
          berthLabel: "1",
          details: "Status changed from free to occupied",
          status: "occupied",
        },
      ]),
    );
    mockFetch(() => jsonResponse([]));
    renderWithAuthLayout(<ActivityLogPanel berths={[]} isOpen />, {
      auth: { user, token: "t" },
    });
    expect(
      await screen.findByText(/Status changed from free to occupied/),
    ).toBeInTheDocument();
  });

  test("filters events by type", async () => {
    const user = makeUser({ user_id: "u123", role: "harbormaster" });
    localStorage.setItem(
      `dockpulse_activity_log:${user.user_id}`,
      JSON.stringify([
        {
          id: "e1",
          timestamp: new Date().toISOString(),
          type: "status_change",
          berthId: "B1",
          berthLabel: "1",
          details: "Status changed",
          status: "free",
        },
        {
          id: "e2",
          timestamp: new Date().toISOString(),
          type: "owner_assignment",
          berthId: "B2",
          berthLabel: "2",
          details: "New owner assigned to berth",
        },
      ]),
    );
    mockFetch(() => jsonResponse([]));
    const userEvt = userEvent.setup();
    renderWithAuthLayout(<ActivityLogPanel berths={[]} isOpen />, {
      auth: { user, token: "t" },
    });
    await screen.findByText("Status changed");
    await userEvt.click(screen.getByRole("button", { name: /^owners$/i }));
    expect(screen.queryByText("Status changed")).not.toBeInTheDocument();
    expect(screen.getByText("New owner assigned to berth")).toBeInTheDocument();
  });

  test("synthesizes events from berth status changes", async () => {
    mockFetch(() => jsonResponse([]));
    const user = makeUser({ user_id: "u123", role: "harbormaster" });
    let setBerths!: (b: Berth[]) => void;
    function Harness() {
      const [berths, set] = useState<Berth[]>([
        makeBerth({ berth_id: "B1", status: "free" }),
      ]);
      setBerths = set;
      return <ActivityLogPanel berths={berths} isOpen />;
    }
    renderWithAuthLayout(<Harness />, { auth: { user, token: "t" } });
    await screen.findByText(/waiting for activity/i);
    act(() => setBerths([makeBerth({ berth_id: "B1", status: "occupied" })]));
    await waitFor(() =>
      expect(
        screen.getByText("Status changed from free to occupied"),
      ).toBeInTheDocument(),
    );
  });

  test("close fires callback", async () => {
    mockFetch(() => jsonResponse([]));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithAuthLayout(
      <ActivityLogPanel berths={[]} isOpen onCloseCB={onClose} />,
      { auth: { user: makeUser({ role: "harbormaster" }), token: "t" } },
    );
    await screen.findByText(/waiting for activity/i);
    const buttons = screen.getAllByRole("button");
    const closeBtn = buttons.find(
      (b) =>
        !["all", "status", "owners"].includes(
          b.textContent?.toLowerCase() ?? "",
        ),
    );
    if (!closeBtn) throw new Error("close button not found");
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
