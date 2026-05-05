import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { MapLegend } from "../MapLegend";

describe("MapLegend", () => {
  test("renders all status entries", () => {
    render(<MapLegend />);
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Occupied")).toBeInTheDocument();
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  test("toggle button hides after open and re-shows after close", async () => {
    const user = userEvent.setup();
    render(<MapLegend />);
    const open = screen.getByLabelText(/show legend/i);
    await user.click(open);
    expect(screen.queryByLabelText(/show legend/i)).not.toBeInTheDocument();

    const close = screen.getAllByRole("button")[0];
    await user.click(close);
    expect(screen.getByLabelText(/show legend/i)).toBeInTheDocument();
  });
});
