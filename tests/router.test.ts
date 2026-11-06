import { describe, it, expect } from "vitest";
import { ModelRouter } from "@/lib/ai/router";

describe("AI Model Router", () => {
  it("should route simple short greetings to the cheap tier", () => {
    const greetings = ["alo", "chào em", "hello mì", "cảm ơn bạn"];
    for (const text of greetings) {
      const decision = ModelRouter.route(text, "public");
      expect(decision.tier).toBe("cheap");
      expect(decision.isComplex).toBe(false);
    }
  });

  it("should force complex tier when user specifies /think prefix", () => {
    const decision = ModelRouter.route("/think Hãy giải thích cơ chế tối ưu chi phí qua Prompt Caching", "public");
    expect(decision.tier).toBe("complex");
    expect(decision.isComplex).toBe(true);
    expect(decision.reason).toContain("suy luận chuyên sâu");
  });

  it("should route technical code snippets to the complex tier", () => {
    const codeQuery = "Viết hàm JavaScript kiểm tra RLS: ```const check = () => true```";
    const decision = ModelRouter.route(codeQuery, "public");
    expect(decision.tier).toBe("complex");
    expect(decision.isComplex).toBe(true);
  });

  it("should route agent task planning to the complex tier", () => {
    const decision = ModelRouter.route("Nghiên cứu danh mục ảnh bán chạy", "task");
    expect(decision.tier).toBe("complex");
    expect(decision.isComplex).toBe(true);
  });
});

