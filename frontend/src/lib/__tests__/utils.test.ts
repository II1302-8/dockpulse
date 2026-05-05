import { describe, expect, test } from "vitest";
import { cn } from "../utils";

describe("cn", () => {
  test("joins truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  test("drops falsy entries", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  test("merges conflicting tailwind classes via tailwind-merge", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  test("supports conditional object form", () => {
    expect(cn("base", { active: true, disabled: false })).toBe("base active");
  });

  test("flattens arrays", () => {
    expect(cn(["a", ["b", "c"]])).toBe("a b c");
  });
});
