import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  errorResponse,
  jsonResponse,
  makeBerth,
  makeEvent,
  makeUser,
  mockFetch,
  renderWithAuthLayout,
} from "../../test/helpers";
import { BerthDetailPanel } from "../BerthDetailPanel";

describe("BerthDetailPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders supplied live berth without fetching", async () => {
    const fetchSpy = mockFetch(() => jsonResponse(makeBerth()));
    const berth = makeBerth({
      berth_id: "B7",
      label: "7",
      status: "occupied",
    });
    renderWithAuthLayout(
      <BerthDetailPanel berthId="B7" onCloseCB={() => {}} berth={berth} />,
      {
        auth: { user: makeUser({ role: "boat_owner" }), token: "t" },
      },
    );
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByText("occupied")).toBeInTheDocument();
    // boat owner does not load events list
    const eventCalls = fetchSpy.mock.calls.filter((c) =>
      String(c[0]).includes("/events"),
    );
    expect(eventCalls).toHaveLength(0);
  });

  test("fetches berth when no live data passed", async () => {
    mockFetch(() =>
      jsonResponse(makeBerth({ berth_id: "B1", label: "1", status: "free" })),
    );
    renderWithAuthLayout(
      <BerthDetailPanel berthId="B1" onCloseCB={() => {}} />,
      { auth: { user: makeUser({ role: "boat_owner" }), token: "t" } },
    );
    expect(await screen.findByText("1")).toBeInTheDocument();
    expect(screen.getByText("free")).toBeInTheDocument();
  });

  test("surfaces fetch error", async () => {
    mockFetch(() => errorResponse(500, { detail: "boom" }));
    renderWithAuthLayout(
      <BerthDetailPanel berthId="B1" onCloseCB={() => {}} />,
      { auth: { user: makeUser({ role: "boat_owner" }), token: "t" } },
    );
    expect(await screen.findByText(/Error:/)).toBeInTheDocument();
  });

  test("harbormaster sees recent events list", async () => {
    mockFetch((url) => {
      if (url.includes("/events"))
        return jsonResponse([
          makeEvent({ event_id: "e1", event_type: "occupied" }),
          makeEvent({ event_id: "e2", event_type: "freed" }),
        ]);
      return jsonResponse(makeBerth({ berth_id: "B1" }));
    });
    renderWithAuthLayout(
      <BerthDetailPanel
        berthId="B1"
        onCloseCB={() => {}}
        berth={makeBerth({ berth_id: "B1" })}
      />,
      { auth: { user: makeUser({ role: "harbormaster" }), token: "t" } },
    );
    expect(await screen.findByText("Recent Activity")).toBeInTheDocument();
    expect(await screen.findByText("occupied")).toBeInTheDocument();
    expect(await screen.findByText("freed")).toBeInTheDocument();
  });

  test("close button fires callback after timeout", async () => {
    mockFetch(() => jsonResponse(makeBerth({ berth_id: "B1" })));
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithAuthLayout(
      <BerthDetailPanel
        berthId="B1"
        onCloseCB={onClose}
        berth={makeBerth({ berth_id: "B1" })}
      />,
      { auth: { user: makeUser({ role: "boat_owner" }), token: "t" } },
    );
    await user.click(screen.getByLabelText(/close panel/i));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled(), {
      timeout: 1500,
    });
  });

  test("renders battery bar when battery_pct provided", async () => {
    mockFetch(() => jsonResponse(makeBerth({ battery_pct: 15 })));
    renderWithAuthLayout(
      <BerthDetailPanel
        berthId="B1"
        onCloseCB={() => {}}
        berth={makeBerth({ berth_id: "B1", battery_pct: 15 })}
      />,
      { auth: { user: makeUser({ role: "boat_owner" }), token: "t" } },
    );
    expect(await screen.findByText("Node Battery")).toBeInTheDocument();
    expect(await screen.findByText("15%")).toBeInTheDocument();
  });
});
