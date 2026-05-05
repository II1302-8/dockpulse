import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Footer } from "../layout/Footer";

describe("Footer", () => {
  test("renders current year and tagline", () => {
    render(<Footer />);
    expect(
      screen.getByText(`${new Date().getFullYear()} DockPulse`),
    ).toBeInTheDocument();
    expect(screen.getByText("Maritime Monitoring")).toBeInTheDocument();
  });
});
