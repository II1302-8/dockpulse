import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { errorResponse, jsonResponse, mockFetch } from "../../test/helpers";
import { NotificationSettings } from "../NotificationSettings";

describe("NotificationSettings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders nothing while prefs are loading", () => {
    mockFetch(() => new Promise(() => {}));
    const { container } = render(<NotificationSettings token="t" />);
    expect(container).toBeEmptyDOMElement();
  });

  test("renders prefs after fetch", async () => {
    mockFetch(() =>
      jsonResponse({ notify_arrival: true, notify_departure: false }),
    );
    render(<NotificationSettings token="t" />);
    expect(await screen.findByText("Arrival Alerts")).toBeInTheDocument();
    expect(screen.getByText("Departure Alerts")).toBeInTheDocument();
  });

  test("toggling a pref sends PATCH and shows success", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    mockFetch((url, init) => {
      calls.push({ url, init });
      if (init?.method === "PATCH") return jsonResponse({ ok: true });
      return jsonResponse({ notify_arrival: false, notify_departure: false });
    });
    const user = userEvent.setup();
    render(<NotificationSettings token="t" />);
    const arrivalBtn = await screen.findByRole("button", {
      name: /arrival alerts/i,
    });
    await user.click(arrivalBtn);
    await waitFor(() =>
      expect(screen.getByText("Preferences updated.")).toBeInTheDocument(),
    );
    const patchCall = calls.find((c) => c.init?.method === "PATCH");
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.init?.body))).toEqual({
      notify_arrival: true,
      notify_departure: false,
    });
  });

  test("PATCH failure shows error message", async () => {
    let patched = false;
    mockFetch((_url, init) => {
      if (init?.method === "PATCH") {
        patched = true;
        return errorResponse(500);
      }
      return jsonResponse({ notify_arrival: false, notify_departure: false });
    });
    const user = userEvent.setup();
    render(<NotificationSettings token="t" />);
    await user.click(
      await screen.findByRole("button", { name: /arrival alerts/i }),
    );
    await waitFor(() => expect(patched).toBe(true));
    await waitFor(() =>
      expect(
        screen.getByText("Failed to update preferences."),
      ).toBeInTheDocument(),
    );
  });

  test("initial fetch failure shows load error", async () => {
    mockFetch(() => errorResponse(503));
    render(<NotificationSettings token="t" />);
    expect(
      await screen.findByText(/failed to load preferences/i),
    ).toBeInTheDocument();
  });
});
