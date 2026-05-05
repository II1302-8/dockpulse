import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
import { resetEventSourceMock } from "./eventSource";

// node 22+ Web Storage stub shadows jsdom's and lacks .clear, force in-memory shim
class MemoryStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

const localShim = new MemoryStorage();
const sessionShim = new MemoryStorage();
Object.defineProperty(window, "localStorage", {
  value: localShim,
  configurable: true,
});
Object.defineProperty(window, "sessionStorage", {
  value: sessionShim,
  configurable: true,
});
Object.defineProperty(globalThis, "localStorage", {
  value: localShim,
  configurable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: sessionShim,
  configurable: true,
});

beforeEach(() => {
  localShim.clear();
  sessionShim.clear();
  resetEventSourceMock();
});

afterEach(() => {
  document.title = "";
});

if (!("randomUUID" in crypto)) {
  Object.defineProperty(crypto, "randomUUID", {
    value: () =>
      "00000000-0000-4000-8000-000000000000" as `${string}-${string}-${string}-${string}-${string}`,
  });
}
