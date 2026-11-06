import { describe, expect, it } from "vitest";
import { ToSGuard } from "@/features/taskmoney/tos-guard";
import { recommendSurveyAnswer, isExcludedIndustryTrap, DEFAULT_GOLDEN_SURVEY_PERSONA } from "@/features/taskmoney/persona";

describe("TaskMoney Core Modules", () => {
  describe("ToS Guard & Risk Assessment", () => {
    it("evaluates a standard micro-task platform with low to moderate risk", () => {
      const result = ToSGuard.evaluateToS({
        domain: "timebucks.com",
        url: "https://timebucks.com/publishers/index.php?pg=earn&tab=all_surveys",
        tosText: "You can complete tasks and surveys. Automated bots are prohibited.",
      });

      expect(result.domain).toBe("timebucks.com");
      expect(result.automationAllowed).toBe(false);
      expect(result.automationRiskScore).toBeGreaterThanOrEqual(1);
      expect(result.automationRiskScore).toBeLessThanOrEqual(10);
      expect(result.minPayoutUsd).toBe(5);
    });

    it("restricts execution to manual only when risk score reaches 8 or higher", () => {
      const checkHighRisk = ToSGuard.isExecutionPermitted(8);
      expect(checkHighRisk.permitted).toBe(false);
      expect(checkHighRisk.mode).toBe("manual_only");

      const checkSafeRisk = ToSGuard.isExecutionPermitted(5);
      expect(checkSafeRisk.permitted).toBe(true);
      expect(checkSafeRisk.mode).toBe("autonomous_assist");
    });
  });

  describe("Golden Survey Persona", () => {
    it("detects industry traps that cause screen-out", () => {
      expect(isExcludedIndustryTrap("Ngân hàng & Tài chính")).toBe(true);
      expect(isExcludedIndustryTrap("Bán lẻ / Siêu thị")).toBe(true);
      expect(isExcludedIndustryTrap("Nghiên cứu thị trường")).toBe(true);
      expect(isExcludedIndustryTrap("Quảng cáo và PR")).toBe(true);
      expect(isExcludedIndustryTrap("Nông nghiệp / Chăn nuôi")).toBe(false);
    });

    it("recommends choosing 'None of the above' when asked about occupation", () => {
      const question = "Bạn hoặc thành viên trong gia đình có làm việc trong các ngành sau đây không?";
      const options = ["Ngân hàng", "Nghiên cứu thị trường", "Bán lẻ", "Không có ngành nào ở trên"];
      const rec = recommendSurveyAnswer(question, options);

      expect(rec.selectedOption).toBe("Không có ngành nào ở trên");
      expect(rec.rationale).toContain("Screen-out");
    });

    it("recommends household income in the 10-15 million range", () => {
      const question = "Tổng thu nhập bình quân hàng tháng của hộ gia đình bạn là bao nhiêu?";
      const options = ["Dưới 5 triệu", "5 - 10 triệu", "10 - 15 triệu", "Trên 30 triệu"];
      const rec = recommendSurveyAnswer(question, options);

      expect(rec.selectedOption).toBe("10 - 15 triệu");
    });

    it("has the complete default Golden Survey Persona configured", () => {
      expect(DEFAULT_GOLDEN_SURVEY_PERSONA.targetAge).toBe(29);
      expect(DEFAULT_GOLDEN_SURVEY_PERSONA.locations).toContain("TP. Hồ Chí Minh");
      expect(DEFAULT_GOLDEN_SURVEY_PERSONA.householdIncomeVnd).toContain("10-15 triệu");
    });
  });
});

