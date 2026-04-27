import "@testing-library/jest-dom/vitest";

class MockEventSource {
  addEventListener() {}
  close() {}
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  readyState = 0;
}
globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
