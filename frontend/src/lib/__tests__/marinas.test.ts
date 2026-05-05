import { describe, expect, test } from "vitest";
import { getMarinaNameCB, MARINAS } from "../marinas";

describe("getMarinaNameCB", () => {
  test("returns empty string for undefined slug", () => {
    expect(getMarinaNameCB(undefined)).toBe("");
  });

  test("returns configured marina name", () => {
    expect(getMarinaNameCB("saltsjobaden")).toBe("Saltsjöbaden");
  });

  test("falls back to capitalized slug for unknown marina", () => {
    expect(getMarinaNameCB("lidingo")).toBe("Lidingo");
  });

  test("handles single-character slug", () => {
    expect(getMarinaNameCB("x")).toBe("X");
  });
});

describe("MARINAS", () => {
  test("saltsjobaden entry round-trips slug", () => {
    expect(MARINAS.saltsjobaden.slug).toBe("saltsjobaden");
  });
});
