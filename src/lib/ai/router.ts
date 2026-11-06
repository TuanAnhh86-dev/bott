export type ModelTier = "cheap" | "standard" | "complex";

export interface RouteDecision {
  tier: ModelTier;
  modelName: string;
  maxTokens: number;
  temperature: number;
  reason: string;
  isComplex: boolean;
}

const COMPLEX_KEYWORDS = [
  "lập trình", "code", "bug", "debug", "refactor", "viết hàm", "api",
  "thuật toán", "database", "sql", "migration", "architecture", "docker",
  "kế hoạch kinh doanh", "phân tích tài chính", "chiến lược", "hợp đồng",
  "pháp lý", "định giá sản phẩm", "kpi", "penalty", "tối ưu doanh thu"
];

const SIMPLE_GREETINGS = [
  "chào", "hi", "hello", "alo", "em mì", "mì ơi", "cảm ơn", "tks", "thanks", "ok", "bye"
];

function sanitizeModelName(name?: string, fallback: string = "gemini-3.6-flash"): string {
  if (!name || name === "gemini-2.0-flash" || name === "gemini-1.5-flash" || name === "gemini-2.5-pro") return fallback;
  return name;
}

export class ModelRouter {
  static route(userText: string, contextType: "public" | "admin" | "task" = "public"): RouteDecision {
    const text = userText.trim().toLowerCase();

    // Model names from env with safe active defaults
    const modelCheap = sanitizeModelName(process.env.AI_MODEL_CHEAP, "gemini-3.6-flash");
    const modelStandard = sanitizeModelName(process.env.AI_MODEL_STANDARD, "gemini-3.6-flash");
    const modelComplex = sanitizeModelName(process.env.AI_MODEL_COMPLEX, "gemini-3.6-flash");

    // 1. Force Complex override markers
    if (text.startsWith("/think") || text.startsWith("/deep") || text.includes("[deep]")) {
      return {
        tier: "complex",
        modelName: modelComplex,
        maxTokens: 3500,
        temperature: 0.5,
        reason: "Người dùng yêu cầu suy luận chuyên sâu",
        isComplex: true,
      };
    }

    // 2. Automated agent planning and financial tasks always use standard or complex
    if (contextType === "task") {
      return {
        tier: "complex",
        modelName: modelComplex,
        maxTokens: 4000,
        temperature: 0.2,
        reason: "Tác vụ lập kế hoạch / thực thi Agent yêu cầu độ chính xác cao",
        isComplex: true,
      };
    }

    // 3. Admin chat always requires full expressive capacity (never truncate mid-sentence)
    if (contextType === "admin") {
      const isComplex = text.includes("```") || COMPLEX_KEYWORDS.some(k => text.includes(k));
      return {
        tier: isComplex ? "complex" : "standard",
        modelName: isComplex ? modelComplex : modelStandard,
        maxTokens: 3500,
        temperature: 0.6,
        reason: "Admin Executive Chat (Không bao giờ giới hạn ngắt câu)",
        isComplex,
      };
    }

    // 4. Short greetings / questions in public chat -> CHEAP model
    if (text.length < 30 || SIMPLE_GREETINGS.some(g => text === g)) {
      return {
        tier: "cheap",
        modelName: modelCheap,
        maxTokens: 1200,
        temperature: 0.7,
        reason: "Tin nhắn ngắn / chào hỏi thông thường",
        isComplex: false,
      };
    }

    // 5. Code snippets or technical keywords
    if (text.includes("```") || COMPLEX_KEYWORDS.some(k => text.includes(k))) {
      return {
        tier: "complex",
        modelName: modelComplex,
        maxTokens: 3000,
        temperature: 0.3,
        reason: "Phát hiện chủ đề kỹ thuật / tài chính chuyên sâu",
        isComplex: true,
      };
    }

    // 6. Standard model for normal inquiries
    return {
      tier: "standard",
      modelName: modelStandard,
      maxTokens: 2000,
      temperature: 0.7,
      reason: "Hội thoại thông thường",
      isComplex: false,
    };
  }
}
