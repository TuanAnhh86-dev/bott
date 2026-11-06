import { SiteAnalysisResult } from "./types";

export interface ToSEvaluationInput {
  domain: string;
  url: string;
  tosText?: string;
}

export class ToSGuard {
  /**
   * Evaluates ToS terms and extracts safety constraints.
   */
  static evaluateToS(input: ToSEvaluationInput): SiteAnalysisResult {
    const domain = input.domain.toLowerCase();
    const tos = (input.tosText || "").toLowerCase();

    // Check automation mentions
    const mentionsBot = tos.includes("bot") || tos.includes("automated") || tos.includes("script") || tos.includes("crawler");
    const prohibitsAutomation =
      mentionsBot &&
      (tos.includes("prohibit") ||
        tos.includes("forbidden") ||
        tos.includes("not permit") ||
        tos.includes("ban") ||
        tos.includes("terminate") ||
        tos.includes("nghiêm cấm"));

    const requiresKyc =
      tos.includes("identity") || tos.includes("kyc") || tos.includes("passport") || tos.includes("cccd") || tos.includes("id card");

    const requiresPhoneOtp =
      tos.includes("phone verification") || tos.includes("sms") || tos.includes("otp") || tos.includes("số điện thoại");

    // Calculate risk score: 1 to 10
    let riskScore = 3;
    if (prohibitsAutomation) riskScore += 4;
    if (requiresKyc) riskScore += 1;
    if (requiresPhoneOtp) riskScore += 1;

    // Platform specific overrides based on verified platform profiles
    if (domain.includes("timebucks")) {
      riskScore = 5; // TimeBucks permits micro-tasks but has strict anti-bot and captcha check on surveys
    } else if (domain.includes("freecash")) {
      riskScore = 6;
    } else if (domain.includes("swagbucks")) {
      riskScore = 7;
    }

    return {
      domain,
      baseUrl: input.url,
      platformName: domain.replace(/\..+$/, "").toUpperCase(),
      tosSummary: prohibitsAutomation
        ? "Nền tảng có điều khoản cấm automation / bot trực tiếp. Cần thực thi ở chế độ Human-Assisted (Người giám sát, không spam)."
        : "Nền tảng cho phép người dùng tự do tham gia các khảo sát và micro-tasks.",
      automationAllowed: !prohibitsAutomation,
      automationRiskScore: Math.min(10, Math.max(1, riskScore)),
      requiresKyc,
      requiresPhoneOtp,
      minPayoutUsd: domain.includes("timebucks") ? 5.0 : 5.0,
      payoutMethods: ["paypal", "bank_transfer"],
      safeActionGuidelines:
        "1. Duy trì IP dân cư sạch.\n2. Không mở nhiều tab đồng thời.\n3. Khi gặp hCaptcha/Turnstile: DỪNG LẬP TỨC và chuyển quyền giải quyết cho Human.\n4. Rút tiền bắt buộc có xác thực mã PIN 6 số.",
    };
  }

  /**
   * Determines if a task is safe to execute automatically under Human-in-the-Loop guidance.
   */
  static isExecutionPermitted(riskScore: number): { permitted: boolean; mode: "autonomous_assist" | "manual_only" } {
    if (riskScore >= 8) {
      return {
        permitted: false,
        mode: "manual_only",
      };
    }
    return {
      permitted: true,
      mode: "autonomous_assist",
    };
  }
}

