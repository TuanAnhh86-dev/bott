import "server-only";
import { SiteAnalysis, TaskMoneySite } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ResearchSiteInput {
  url: string;
  sampleToSText?: string;
}

export class TaskMoneyResearcher {
  /**
   * Extract domain and normalized site details
   */
  static extractDomain(rawUrl: string): { domain: string; baseUrl: string } {
    try {
      const parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
      const domain = parsed.hostname.toLowerCase().replace(/^www\./, "");
      return {
        domain,
        baseUrl: `${parsed.protocol}//${parsed.hostname}`,
      };
    } catch {
      const clean = rawUrl.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].toLowerCase();
      return {
        domain: clean || "unknown-site.com",
        baseUrl: `https://${clean || "unknown-site.com"}`,
      };
    }
  }

  /**
   * Deep analysis of website Terms of Service and Anti-Bot Barriers
   */
  static async analyzeSite(input: ResearchSiteInput): Promise<{
    site: TaskMoneySite;
    analysis: SiteAnalysis;
  }> {
    const { domain, baseUrl } = this.extractDomain(input.url);

    // Scan text or use realistic heuristic rules
    const textToScan = (input.sampleToSText || "").toLowerCase();

    // Check strict ToS violations
    const strictProhibitions = [
      "no bot",
      "prohibit automation",
      "no scripts",
      "anti-scraping",
      "automated access is prohibited",
      "strictly forbidden",
      "one account per person",
      "no multi-accounting",
      "fraudulent activity will lead to ban",
    ];

    const antiBotSignatures = [
      { name: "Cloudflare Turnstile", keywords: ["cloudflare", "turnstile", "cf-ray"] },
      { name: "reCAPTCHA v3 / Enterprise", keywords: ["recaptcha", "google.com/recaptcha"] },
      { name: "hCaptcha", keywords: ["hcaptcha", "hmt.js"] },
      { name: "Fingerprinting Protection", keywords: ["fingerprint", "canvas", "webgl detection"] },
    ];

    const humanCheckpoints = [
      { name: "SMS / Phone OTP", keywords: ["phone number", "sms verification", "otp"] },
      { name: "ID Card / KYC", keywords: ["passport", "driver license", "identity verification", "kyc"] },
      { name: "PayPal Account Binding", keywords: ["paypal verified", "payout account"] },
    ];

    const detectedAntiBot: string[] = [];
    for (const ab of antiBotSignatures) {
      if (ab.keywords.some((kw) => textToScan.includes(kw))) {
        detectedAntiBot.push(ab.name);
      }
    }

    const detectedCheckpoints: string[] = [];
    for (const cp of humanCheckpoints) {
      if (cp.keywords.some((kw) => textToScan.includes(kw))) {
        detectedCheckpoints.push(cp.name);
      }
    }

    const hasExplicitBotBan = strictProhibitions.some((p) => textToScan.includes(p));

    let riskScore = 3;
    if (hasExplicitBotBan) riskScore += 5;
    if (detectedAntiBot.length > 0) riskScore += detectedAntiBot.length * 1.5;
    if (detectedCheckpoints.includes("ID Card / KYC")) riskScore += 2;
    riskScore = Math.min(Math.max(Math.round(riskScore), 1), 10);

    const tosAutomationAllowed = !hasExplicitBotBan && riskScore <= 6;
    const isApprovedForAutomation = tosAutomationAllowed && detectedAntiBot.length <= 1;

    let strategyRecommendation = "SAFE_AUTONOMOUS: Nhiệm vụ có thể tự động hóa trong giới hạn an toàn.";
    if (hasExplicitBotBan || riskScore >= 8) {
      strategyRecommendation = "FORBIDDEN: Website nghiêm cấm bot/automation theo ToS. Dừng lại, không được can thiệp.";
    } else if (detectedCheckpoints.length > 0 || detectedAntiBot.length > 0) {
      strategyRecommendation = "HUMAN_IN_THE_LOOP: Cần người dùng can thiệp giải Captcha hoặc xác thực tài khoản ban đầu.";
    }

    const now = new Date().toISOString();

    const siteRecord: TaskMoneySite = {
      id: crypto.randomUUID(),
      domain,
      siteName: domain.split(".")[0].toUpperCase(),
      baseUrl,
      category: "task_earning",
      tosAutomationAllowed,
      tosSummary: hasExplicitBotBan
        ? "Cấm tự động hóa và bot theo Điều khoản Dịch vụ."
        : "Cho phép tương tác người dùng hợp lệ với rate limit chuẩn.",
      riskScore,
      requiresKyc: detectedCheckpoints.includes("ID Card / KYC"),
      minWithdrawalVnd: 50000,
      supportedPayoutMethods: ["paypal", "bank_transfer"],
      isActive: !hasExplicitBotBan,
      createdAt: now,
      updatedAt: now,
    };

    const analysisRecord: SiteAnalysis = {
      id: crypto.randomUUID(),
      siteId: siteRecord.id,
      researcherAgentVersion: "taskmoney-researcher-v1.0.0",
      tosTextSnapshot: input.sampleToSText ? input.sampleToSText.slice(0, 1000) : "Chưa có snapshot ToS đầy đủ.",
      antiBotSystems: detectedAntiBot,
      humanCheckpoints: detectedCheckpoints,
      earningPotentialRating: riskScore <= 4 ? "HIGH" : riskScore <= 7 ? "MEDIUM" : "LOW",
      strategyRecommendation,
      isApprovedForAutomation,
      createdAt: now,
    };

    // Save or upsert to Supabase if database is available
    try {
      const supabase = createAdminClient();
      const { data: existingSite } = await supabase
        .from("taskmoney_sites")
        .select("id")
        .eq("domain", domain)
        .maybeSingle();

      if (existingSite) {
        siteRecord.id = existingSite.id;
        analysisRecord.siteId = existingSite.id;
        await supabase
          .from("taskmoney_sites")
          .update({
            tos_automation_allowed: siteRecord.tosAutomationAllowed,
            tos_summary: siteRecord.tosSummary,
            risk_score: siteRecord.riskScore,
            requires_kyc: siteRecord.requiresKyc,
            updated_at: now,
          })
          .eq("id", existingSite.id);
      } else {
        await supabase.from("taskmoney_sites").insert({
          id: siteRecord.id,
          domain: siteRecord.domain,
          site_name: siteRecord.siteName,
          base_url: siteRecord.baseUrl,
          category: siteRecord.category,
          tos_automation_allowed: siteRecord.tosAutomationAllowed,
          tos_summary: siteRecord.tosSummary,
          risk_score: siteRecord.riskScore,
          requires_kyc: siteRecord.requiresKyc,
          min_withdrawal_vnd: siteRecord.minWithdrawalVnd,
          supported_payout_methods: siteRecord.supportedPayoutMethods,
          is_active: siteRecord.isActive,
        });
      }

      await supabase.from("taskmoney_analyses").insert({
        id: analysisRecord.id,
        site_id: siteRecord.id,
        researcher_agent_version: analysisRecord.researcherAgentVersion,
        tos_text_snapshot: analysisRecord.tosTextSnapshot,
        anti_bot_systems: analysisRecord.antiBotSystems,
        human_checkpoints: analysisRecord.humanCheckpoints,
        earning_potential_rating: analysisRecord.earningPotentialRating,
        strategy_recommendation: analysisRecord.strategyRecommendation,
        is_approved_for_automation: analysisRecord.isApprovedForAutomation,
      });
    } catch (dbErr) {
      // In isolated tests or when tables are not yet migrated, fall back gracefully
      console.warn("[TaskMoneyResearcher] Supabase persistence skipped/fallback:", dbErr);
    }

    return { site: siteRecord, analysis: analysisRecord };
  }
}

