type Listener = (ev: MessageEvent) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  url: string;
  readyState = 0;
  onopen: ((ev: Event) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  closed = false;

  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: Listener) {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
    this.readyState = 2;
  }

  emitOpen() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }

  emitError() {
    this.onerror?.(new Event("error"));
  }

  emit(type: string, data: unknown) {
    const ev = new MessageEvent(type, {
      data: typeof data === "string" ? data : JSON.stringify(data),
    });
    if (type === "message") this.onmessage?.(ev);
    this.listeners.get(type)?.forEach((l) => {
      l(ev);
    });
  }
}

export function resetEventSourceMock() {
  FakeEventSource.instances = [];
}

export function getLastEventSource(): FakeEventSource {
  const last = FakeEventSource.instances.at(-1);
  if (!last) throw new Error("no EventSource constructed yet");
  return last;
}

globalThis.EventSource = FakeEventSource as unknown as typeof EventSource;

export { FakeEventSource };
