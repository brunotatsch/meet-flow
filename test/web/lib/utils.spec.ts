import { describe, expect, it } from "vitest";
import { cn } from "@web/lib/utils";

describe("cn", () => {
  it("combina classes condicionais", () => {
    const isActive = false;
    expect(cn("a", isActive && "b", "c")).toBe("a c");
  });

  it("resolve conflito do Tailwind mantendo a última classe", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
  });
});
