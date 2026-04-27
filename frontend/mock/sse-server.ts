/**
 * Dev-only SSE mock for `/api/berths/stream`. Prism can mock REST from the
 * OpenAPI spec but cannot emit SSE frames, so `bun dev:mock` runs this
 * alongside prism and Vite proxies the stream path here.
 */

type Berth = {
  berth_id: string;
  dock_id: string;
  status: "free" | "occupied";
  label?: string;
  sensor_raw?: number;
  battery_pct?: number;
  last_updated?: string;
};

const DOCK_ID = "ksss-saltsjobaden-pier-1";
const SIDES: Array<"t" | "l" | "r"> = ["t", "l", "r"];

const BERTHS: Berth[] = SIDES.flatMap((side) =>
  [1, 2, 3, 4].map((idx) => ({
    berth_id: `${DOCK_ID}-${side}${idx}`,
    dock_id: DOCK_ID,
    label: `${side.toUpperCase()}${idx}`,
    status: "free" as const,
    battery_pct: 80,
  })),
);

const PORT = Number(process.env.MOCK_SSE_PORT ?? 4011);
const INTERVAL_MS = 3000;

function encodeFrame(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/api/berths/stream") {
      return new Response("not found", { status: 404 });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let i = 0;
        const tick = () => {
          const berth = BERTHS[i % BERTHS.length];
          i++;
          berth.status = berth.status === "free" ? "occupied" : "free";
          berth.last_updated = new Date().toISOString();
          controller.enqueue(encodeFrame("berth.update", { type: "berth.update", berth }));
        };
        const handle = setInterval(tick, INTERVAL_MS);
        req.signal.addEventListener("abort", () => {
          clearInterval(handle);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  },
});

console.log(`SSE mock listening on http://localhost:${PORT}/api/berths/stream`);
