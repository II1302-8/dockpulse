import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AdoptNodeModal } from "../components/AdoptNodeModal";

// html5-qrcode requires getUserMedia, jsdom has none, stub class
vi.mock("html5-qrcode", () => {
  return {
    Html5Qrcode: class {
      start = vi.fn().mockResolvedValue(undefined);
      stop = vi.fn().mockResolvedValue(undefined);
    },
  };
});

const sampleGateway = {
  gateway_id: "gw-a",
  dock_id: "d1",
  name: "Test Gateway",
  status: "online",
  last_seen: null,
};

const sampleBerth = {
  berth_id: "b1",
  dock_id: "d1",
  label: "B-1",
  length_m: 8,
  width_m: 3,
  depth_m: 2.5,
  status: "free",
  is_reserved: false,
  sensor_raw: null,
  battery_pct: null,
  last_updated: null,
  assignment: null,
};

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/gateways")) {
        return new Response(JSON.stringify([sampleGateway]), { status: 200 });
      }
      if (url.startsWith("/api/berths")) {
        return new Response(JSON.stringify([sampleBerth]), { status: 200 });
      }
      if (url === "/api/adoptions" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            request_id: "req-1",
            mesh_uuid: "abcd",
            serial_number: "DP-N-1",
            gateway_id: "gw-a",
            berth_id: "b1",
            status: "pending",
            error_code: null,
            error_msg: null,
            mesh_unicast_addr: null,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            created_at: new Date().toISOString(),
            completed_at: null,
          }),
          { status: 202 },
        );
      }
      return new Response("not stubbed", { status: 500 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("AdoptNodeModal", () => {
  test("renders nothing when closed", () => {
    const { container } = render(
      <AdoptNodeModal open={false} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("opens to gateway step and shows online gateway", async () => {
    render(<AdoptNodeModal open={true} onClose={() => {}} />);
    expect(await screen.findByText("Adopt Sensor Node")).toBeInTheDocument();
    expect(await screen.findByText("Pick gateway")).toBeInTheDocument();
    expect(await screen.findByText("Test Gateway")).toBeInTheDocument();
  });

  test("paste flow advances through gateway → berth → qr → progress", async () => {
    const user = userEvent.setup();
    render(<AdoptNodeModal open={true} onClose={() => {}} />);

    await user.click(await screen.findByText("Test Gateway"));
    expect(await screen.findByText("Pick berth")).toBeInTheDocument();

    await user.click(await screen.findByText("B-1"));
    expect(await screen.findByText("Scan or paste QR")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Paste/i }));
    const textarea = await screen.findByLabelText("QR payload");
    await user.type(textarea, "fake-qr-payload");

    await user.click(screen.getByRole("button", { name: /Adopt node/i }));

    await waitFor(() => {
      expect(screen.getByText("Adoption progress")).toBeInTheDocument();
    });
    expect(screen.getByText(/Awaiting gateway/)).toBeInTheDocument();
  });

  test("close button calls onClose", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<AdoptNodeModal open={true} onClose={onClose} />);
    await user.click(await screen.findByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("surfaces 409 berth-busy as inline error", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.startsWith("/api/gateways"))
          return new Response(JSON.stringify([sampleGateway]), { status: 200 });
        if (url.startsWith("/api/berths"))
          return new Response(JSON.stringify([sampleBerth]), { status: 200 });
        if (url === "/api/adoptions" && init?.method === "POST")
          return new Response(
            JSON.stringify({ detail: "Berth already has an active node" }),
            { status: 409 },
          );
        return new Response("?", { status: 500 });
      }),
    );

    render(<AdoptNodeModal open={true} onClose={() => {}} />);
    await user.click(await screen.findByText("Test Gateway"));
    await user.click(await screen.findByText("B-1"));
    await user.click(screen.getByRole("button", { name: /Paste/i }));
    await user.type(await screen.findByLabelText("QR payload"), "x");
    await user.click(screen.getByRole("button", { name: /Adopt node/i }));

    expect(
      await screen.findByText(/Berth already has an active node/),
    ).toBeInTheDocument();
  });
});
