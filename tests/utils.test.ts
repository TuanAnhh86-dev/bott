import { describe, it, expect } from "vitest";
import { formatVND, formatPercent, cn } from "@/lib/utils";

describe("Utility Functions", () => {
  it("should format VND currency accurately", () => {
    expect(formatVND(0)).toContain("0");
    expect(formatVND(5000000)).toContain("5.000.000");
    expect(formatVND(null)).toContain("0");
  });

  it("should format percentage correctly", () => {
    expect(formatPercent(50)).toBe("50%");
    expect(formatPercent(33.333)).toBe("33.3%");
    expect(formatPercent(null)).toBe("0%");
  });

  it("should merge tailwind classes properly", () => {
    expect(cn("px-2 py-1", "bg-emerald-500")).toBe("px-2 py-1 bg-emerald-500");
    expect(cn("p-4", "p-2")).toBe("p-2"); // tailwind-merge resolves conflicts
  });
});

