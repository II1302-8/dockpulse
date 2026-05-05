import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { App } from "../App";

vi.mock("../components/layout/MainLayout", () => ({
  MainLayout: () => <div data-testid="main-layout" />,
}));

describe("App", () => {
  test("renders MainLayout for a marina route", async () => {
    window.history.pushState({}, "", "/saltsjobaden");
    render(<App />);
    expect(await screen.findByTestId("main-layout")).toBeInTheDocument();
  });

  test("redirects root path to /saltsjobaden", async () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    await screen.findByTestId("main-layout");
    expect(window.location.pathname).toBe("/saltsjobaden");
  });
});
