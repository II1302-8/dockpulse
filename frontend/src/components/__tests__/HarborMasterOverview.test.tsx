import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { makeBerth } from "../../test/helpers";
import { HarborMasterOverview } from "../HarborMasterOverview";

describe("HarborMasterOverview", () => {
  test("renders occupancy percentage", () => {
    render(
      <HarborMasterOverview
        isOpen
        berths={[
          makeBerth({ berth_id: "B1", status: "occupied" }),
          makeBerth({ berth_id: "B2", status: "occupied" }),
          makeBerth({ berth_id: "B3", status: "free" }),
          makeBerth({ berth_id: "B4", status: "free" }),
        ]}
      />,
    );
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  test("shows zero occupancy for empty list", () => {
    render(<HarborMasterOverview isOpen berths={[]} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });

  test("counts free vs total berths", () => {
    render(
      <HarborMasterOverview
        isOpen
        berths={[
          makeBerth({ berth_id: "B1", status: "free" }),
          makeBerth({ berth_id: "B2", status: "occupied" }),
        ]}
      />,
    );
    // free / total renders as "1" "/" "2" inside one <p>
    const freeBlock = screen.getByText("Free").closest("div")?.parentElement;
    expect(freeBlock?.textContent).toContain("1");
    expect(freeBlock?.textContent).toContain("2");
  });

  test("shows static system status rows", () => {
    render(<HarborMasterOverview isOpen berths={[makeBerth()]} />);
    expect(screen.getByText("IoT Mesh Network")).toBeInTheDocument();
    expect(screen.getByText("Real-time Stream")).toBeInTheDocument();
    expect(screen.getByText("Cloud Sync")).toBeInTheDocument();
  });

  test("close fires callback", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <HarborMasterOverview
        isOpen
        berths={[makeBerth()]}
        onCloseCB={onClose}
      />,
    );
    await user.click(screen.getByRole("button"));
    expect(onClose).toHaveBeenCalled();
  });
});
