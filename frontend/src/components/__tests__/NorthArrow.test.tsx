import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { NorthArrow } from "../NorthArrow";

describe("NorthArrow", () => {
  test('shows "N" label', () => {
    render(<NorthArrow />);
    expect(screen.getByText("N")).toBeInTheDocument();
  });
});
