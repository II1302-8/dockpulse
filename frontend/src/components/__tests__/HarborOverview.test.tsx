import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { makeBerth } from "../../test/helpers";
import { HarborOverview } from "../HarborOverview";

const fresh = () => new Date().toISOString();
const stale = () => new Date(Date.now() - 6 * 60 * 1000).toISOString();

describe("HarborOverview", () => {
  test("computes availability from online berths", () => {
    render(
      <HarborOverview
        isOpen
        berths={[
          makeBerth({ berth_id: "B1", status: "free", last_updated: fresh() }),
          makeBerth({
            berth_id: "B2",
            status: "occupied",
            last_updated: fresh(),
          }),
        ]}
      />,
    );
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Berths available")).toBeInTheDocument();
  });

  test("offline berths are excluded from availability and counted separately", () => {
    render(
      <HarborOverview
        isOpen
        berths={[
          makeBerth({ berth_id: "B1", status: "free", last_updated: fresh() }),
          makeBerth({ berth_id: "B2", last_updated: stale() }),
        ]}
      />,
    );
    expect(screen.getByText(/1 sensor offline/i)).toBeInTheDocument();
  });

  test('shows "All Systems Online" when no offline or low battery', () => {
    render(
      <HarborOverview
        isOpen
        berths={[
          makeBerth({
            berth_id: "B1",
            last_updated: fresh(),
            battery_pct: 90,
          }),
        ]}
      />,
    );
    expect(screen.getByText("All Systems Online")).toBeInTheDocument();
  });

  test("lists low battery online nodes", () => {
    render(
      <HarborOverview
        isOpen
        berths={[
          makeBerth({
            berth_id: "B9",
            label: "9",
            last_updated: fresh(),
            battery_pct: 10,
          }),
        ]}
      />,
    );
    expect(screen.getByText("B-9")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
  });

  test("close button fires callback", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <HarborOverview isOpen berths={[makeBerth()]} onCloseCB={onClose} />,
    );
    await user.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalled();
  });

  test("handles empty berth list without dividing by zero", () => {
    render(<HarborOverview isOpen berths={[]} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
