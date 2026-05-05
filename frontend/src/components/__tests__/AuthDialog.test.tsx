import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { errorResponse, jsonResponse, mockFetch } from "../../test/helpers";
import { AuthDialog } from "../layout/AuthDialog";

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof AuthDialog>> = {},
) {
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    onAuthSuccess: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<AuthDialog {...props} />) };
}

describe("AuthDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("renders login tab by default", () => {
    renderDialog();
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
  });

  test("switches to signup tab", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("tab", { name: /sign up/i }));
    expect(
      screen.getByRole("heading", { name: /create account/i }),
    ).toBeInTheDocument();
  });

  test("submit disabled until login fields filled", async () => {
    renderDialog();
    const submit = screen.getByRole("button", { name: /sign in/i });
    expect(submit).toBeDisabled();
  });

  test("login flow calls onAuthSuccess with token", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/auth/login"))
        return jsonResponse({ access_token: "tok-123" });
      return errorResponse(404);
    });
    const onAuthSuccess = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onAuthSuccess });
    await user.type(screen.getByLabelText(/^email$/i), "olle@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() =>
      expect(onAuthSuccess).toHaveBeenCalledWith("tok-123", {
        email: "olle@example.com",
      }),
    );
  });

  test("login surfaces server error", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/auth/login"))
        return errorResponse(401, { detail: "wrong password" });
      return errorResponse(404);
    });
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/^email$/i), "olle@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(await screen.findByText(/wrong password/i)).toBeInTheDocument();
  });

  test("signup blocks until passwords match", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("tab", { name: /sign up/i }));
    await user.type(screen.getByLabelText(/^email$/i), "olle@example.com");
    await user.type(screen.getByLabelText(/first name/i), "Olle");
    await user.type(screen.getByLabelText(/last name/i), "Owner");
    await user.type(screen.getByLabelText(/^password$/i), "abcd");
    await user.type(screen.getByLabelText(/confirm password/i), "different");
    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeDisabled();
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
  });

  test("signup calls register then auto-logs in", async () => {
    const calls: string[] = [];
    mockFetch((url) => {
      calls.push(url);
      if (url.endsWith("/api/auth/register")) return jsonResponse({});
      if (url.endsWith("/api/auth/login"))
        return jsonResponse({ access_token: "tok-new" });
      return errorResponse(404);
    });
    const onAuthSuccess = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onAuthSuccess });
    await user.click(screen.getByRole("tab", { name: /sign up/i }));
    await user.type(screen.getByLabelText(/^email$/i), "ny@example.com");
    await user.type(screen.getByLabelText(/first name/i), "Nya");
    await user.type(screen.getByLabelText(/last name/i), "Skeppare");
    await user.type(screen.getByLabelText(/^password$/i), "password");
    await user.type(screen.getByLabelText(/confirm password/i), "password");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() => expect(onAuthSuccess).toHaveBeenCalled());
    expect(calls).toContain("/api/auth/register");
    expect(calls).toContain("/api/auth/login");
  });

  test("signup surfaces array-form 422 errors", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/auth/register"))
        return errorResponse(422, {
          detail: [{ loc: ["body", "email"], msg: "exists" }],
        });
      return errorResponse(404);
    });
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole("tab", { name: /sign up/i }));
    await user.type(screen.getByLabelText(/^email$/i), "ny@example.com");
    await user.type(screen.getByLabelText(/first name/i), "Nya");
    await user.type(screen.getByLabelText(/last name/i), "Skeppare");
    await user.type(screen.getByLabelText(/^password$/i), "password");
    await user.type(screen.getByLabelText(/confirm password/i), "password");
    await user.click(screen.getByRole("button", { name: /create account/i }));
    expect(await screen.findByText(/email: exists/i)).toBeInTheDocument();
  });

  test("login throws when token missing in response", async () => {
    mockFetch((url) => {
      if (url.endsWith("/api/auth/login")) return jsonResponse({});
      return errorResponse(404);
    });
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText(/^email$/i), "olle@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    expect(
      await screen.findByText(/no access token was returned/i),
    ).toBeInTheDocument();
  });
});
