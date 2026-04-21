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

const BERTHS: Berth[] = [
  {
    berth_id: "b1",
    dock_id: "d1",
    label: "A-01",
    status: "free",
    battery_pct: 90,
  },
  {
    berth_id: "b2",
    dock_id: "d1",
    label: "A-02",
    status: "occupied",
    battery_pct: 72,
  },
  {
    berth_id: "b3",
    dock_id: "d1",
    label: "A-03",
    status: "free",
    battery_pct: 55,
  },
];

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
          controller.enqueue(
            encodeFrame("berth.update", { type: "berth.update", berth }),
          );
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
