import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  errorResponse,
  jsonResponse,
  makeUser,
  mockFetch,
  renderWithAuthLayout,
} from "../../test/helpers";
import { Settings } from "../Settings";

function notifPrefsHandler() {
  return jsonResponse({ notify_arrival: false, notify_departure: false });
}

describe("Settings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("logged-out users see login prompt", async () => {
    mockFetch(() => notifPrefsHandler());
    const setIsLoginOpen = vi.fn();
    const user = userEvent.setup();
    renderWithAuthLayout(<Settings />, { auth: { setIsLoginOpen } });
    await user.click(screen.getByRole("button", { name: /log in/i }));
    expect(setIsLoginOpen).toHaveBeenCalledWith(true);
  });

  test("hydrates form with user details", async () => {
    mockFetch(() => notifPrefsHandler());
    const u = makeUser({
      firstname: "Olle",
      lastname: "Owner",
      email: "olle@example.com",
      phone: "0700000000",
      boat_club: "KSSS",
    });
    renderWithAuthLayout(<Settings />, { auth: { user: u, token: "t" } });
    expect(
      (screen.getByLabelText(/first name/i) as HTMLInputElement).value,
    ).toBe("Olle");
    expect(
      (screen.getByLabelText(/last name/i) as HTMLInputElement).value,
    ).toBe("Owner");
    expect((screen.getByLabelText(/^email$/i) as HTMLInputElement).value).toBe(
      "olle@example.com",
    );
  });

  test("client-side validation blocks submit on empty firstname", async () => {
    const fetchSpy = mockFetch(() => notifPrefsHandler());
    const user = userEvent.setup();
    renderWithAuthLayout(<Settings />, {
      auth: { user: makeUser(), token: "t" },
    });
    await user.clear(screen.getByLabelText(/first name/i));
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      await screen.findByText(/first name is required/i),
    ).toBeInTheDocument();
    const patchCall = fetchSpy.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "PATCH",
    );
    expect(patchCall).toBeUndefined();
  });

  test("rejects invalid email format", async () => {
    mockFetch(() => notifPrefsHandler());
    const user = userEvent.setup();
    renderWithAuthLayout(<Settings />, {
      auth: { user: makeUser(), token: "t" },
    });
    await user.clear(screen.getByLabelText(/^email$/i));
    await user.type(screen.getByLabelText(/^email$/i), "not-an-email");
    // bypass HTML5 type=email native validation, exercise validateForm
    const form = screen
      .getByRole("button", { name: /save changes/i })
      .closest("form");
    if (!form) throw new Error("form not found");
    fireEvent.submit(form);
    expect(
      await screen.findByText(/enter a valid email address/i),
    ).toBeInTheDocument();
  });

  test("requires current password when changing password", async () => {
    mockFetch(() => notifPrefsHandler());
    const user = userEvent.setup();
    renderWithAuthLayout(<Settings />, {
      auth: { user: makeUser(), token: "t" },
    });
    await user.type(screen.getByLabelText(/new password/i), "supersecret");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      await screen.findByText(/current password is required/i),
    ).toBeInTheDocument();
  });

  test("successful PATCH updates user and shows confirmation", async () => {
    const updated = makeUser({ firstname: "Olle", lastname: "Newland" });
    mockFetch((url, init) => {
      if (url.endsWith("/api/users/me") && init?.method === "PATCH") {
        return jsonResponse(updated);
      }
      return notifPrefsHandler();
    });
    const setUser = vi.fn();
    const user = userEvent.setup();
    renderWithAuthLayout(<Settings />, {
      auth: { user: makeUser(), token: "t", setUser },
    });
    await user.clear(screen.getByLabelText(/last name/i));
    await user.type(screen.getByLabelText(/last name/i), "Newland");
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/profile updated successfully/i),
      ).toBeInTheDocument(),
    );
    expect(setUser).toHaveBeenCalledWith(updated);
  });

  test("surfaces 422 field errors from server", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/api/users/me") && init?.method === "PATCH") {
        return errorResponse(422, {
          detail: [{ loc: ["body", "email"], msg: "email already taken" }],
        });
      }
      return notifPrefsHandler();
    });
    const user = userEvent.setup();
    renderWithAuthLayout(<Settings />, {
      auth: { user: makeUser(), token: "t" },
    });
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(await screen.findByText(/email already taken/i)).toBeInTheDocument();
  });

  test("network failure surfaces a generic error", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/api/users/me") && init?.method === "PATCH") {
        throw new Error("network down");
      }
      return notifPrefsHandler();
    });
    const user = userEvent.setup();
    renderWithAuthLayout(<Settings />, {
      auth: { user: makeUser(), token: "t" },
    });
    await user.click(screen.getByRole("button", { name: /save changes/i }));
    expect(
      await screen.findByText(/could not save profile\. please try again/i),
    ).toBeInTheDocument();
  });
});
