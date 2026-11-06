import { GoldenSurveyPersona } from "./types";

export const DEFAULT_GOLDEN_SURVEY_PERSONA: GoldenSurveyPersona = {
  targetAge: 29,
  ageRange: "25-35",
  maritalStatus: "Đã kết hôn, có con",
  hasChildren: true,
  locations: ["TP. Hồ Chí Minh", "Hà Nội"],
  familyRole: "Người quyết định mua sắm và chi tiêu chính trong gia đình",
  householdIncomeVnd: "10-15 triệu/tháng (Theo thống kê bình quân hộ gia đình)",
  excludedIndustries: [
    "Bán lẻ (Retail)",
    "Ngân hàng / Tài chính (Banking / Finance)",
    "Nghiên cứu thị trường (Market Research)",
    "Quảng cáo / Tiếp thị / Truyền thông / PR",
  ],
  answeringStrategy:
    "Đọc kỹ phần mở đầu để nhận diện ngành nghề bên khảo sát cần thăm dò (vd: ngân hàng, nước giải khát, công nghệ) để tick vào tất cả các ý thể hiện sự quan tâm cao, tránh bị screen-out.",
};

/**
 * Checks if a question option belongs to an excluded industry trap.
 */
export function isExcludedIndustryTrap(optionText: string): boolean {
  const lower = optionText.toLowerCase();
  return (
    lower.includes("bán lẻ") ||
    lower.includes("retail") ||
    lower.includes("ngân hàng") ||
    lower.includes("banking") ||
    lower.includes("tài chính") ||
    lower.includes("finance") ||
    lower.includes("nghiên cứu thị trường") ||
    lower.includes("market research") ||
    lower.includes("quảng cáo") ||
    lower.includes("advertising") ||
    lower.includes("tiếp thị") ||
    lower.includes("marketing") ||
    lower.includes("pr")
  );
}

/**
 * Recommends survey response based on Golden Persona and question context.
 */
export function recommendSurveyAnswer(
  question: string,
  options: string[],
  surveyTopicHint?: string
): { selectedOption: string; rationale: string } {
  const qLower = question.toLowerCase();

  // 1. Occupation trap question
  if (
    qLower.includes("nghề nghiệp") ||
    qLower.includes("lĩnh vực") ||
    qLower.includes("ngành") ||
    qLower.includes("công việc") ||
    qLower.includes("industry") ||
    qLower.includes("occupation")
  ) {
    const noneOfAbove = options.find(
      (opt) =>
        opt.toLowerCase().includes("không có") ||
        opt.toLowerCase().includes("khác") ||
        opt.toLowerCase().includes("none") ||
        opt.toLowerCase().includes("other")
    );
    if (noneOfAbove) {
      return {
        selectedOption: noneOfAbove,
        rationale: "Tránh bẫy Screen-out nghề nghiệp cấm (Bán lẻ, Ngân hàng, Market Research). Chọn 'Không có ngành nào ở trên'.",
      };
    }
  }

  // 2. Household income question (Prioritize 10-15 million range)
  if (qLower.includes("thu nhập") || qLower.includes("income")) {
    const matching10to15 = options.find(
      (opt) =>
        (opt.includes("10") && opt.includes("15")) ||
        opt.includes("10-15") ||
        opt.includes("10 - 15")
    );
    if (matching10to15) {
      return {
        selectedOption: matching10to15,
        rationale: "Thu nhập chuẩn theo Persona: 10 - 15 triệu/tháng (Mức chuẩn thống kê hộ gia đình).",
      };
    }
    const matchingFallback = options.find(
      (opt) => opt.includes("10") || opt.includes("15") || opt.toLowerCase().includes("trung bình")
    );
    if (matchingFallback) {
      return {
        selectedOption: matchingFallback,
        rationale: "Thu nhập chuẩn theo Persona: Mức trung bình chuẩn.",
      };
    }
  }

  // 3. Location question
  if (qLower.includes("nơi sinh sống") || qLower.includes("tỉnh") || qLower.includes("thành phố") || qLower.includes("city")) {
    const matchingLocation = options.find(
      (opt) => opt.toLowerCase().includes("hồ chí minh") || opt.toLowerCase().includes("hà nội") || opt.toLowerCase().includes("hcm")
    );
    if (matchingLocation) {
      return {
        selectedOption: matchingLocation,
        rationale: "Khu vực kinh tế trọng điểm: TP. Hồ Chí Minh / Hà Nội theo Persona.",
      };
    }
  }

  // 4. Interest in survey topic (nương theo chủ đề khảo sát)
  if (surveyTopicHint && options.length > 0) {
    const positiveOption = options.find(
      (opt) =>
        opt.toLowerCase().includes("rất quan tâm") ||
        opt.toLowerCase().includes("thường xuyên") ||
        opt.toLowerCase().includes("có sử dụng") ||
        opt.toLowerCase().includes("yes") ||
        opt.toLowerCase().includes("agree")
    );
    if (positiveOption) {
      return {
        selectedOption: positiveOption,
        rationale: `Nương theo chủ đề khảo sát (${surveyTopicHint}): Chọn đáp án thể hiện sự quan tâm tích cực.`,
      };
    }
  }

  return {
    selectedOption: options[0] || "",
    rationale: "Lựa chọn an toàn mặc định.",
  };
}
