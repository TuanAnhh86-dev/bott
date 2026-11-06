import { ActionCategory, RiskLevel } from "@/types";
import { isEmergencyStopActive } from "./emergency";
import { createAdminClient } from "@/lib/supabase/admin";

// Immutable Forbidden Actions List (Can never be overridden)
export const FORBIDDEN_ACTIONS = [
  "unauthorized_access",
  "data_theft",
  "security_circumvention",
  "unauthorized_financial_transfer",
  "self_grant_permissions",
  "modify_immutable_security",
  "illegal_activity",
  "non_consensual_intimate_content",
  "minor_sexual_content",
  "non_consensual_deepfakes",
  "bypass_platform_terms",
];

// Default Auto-Execute Actions (Low risk, internal only)
export const AUTO_EXECUTE_ACTIONS = [
  "public_web_research",
  "internal_calculation",
  "knowledge_retrieval",
  "document_processing",
  "content_drafting",
  "digital_product_pack",
  "affiliate_campaign_draft",
  "seo_metadata",
  "seo_metadata_generation",
  "ugc_campaign",
  "subscription_ppv",
  "task_management",
  "internal_analytics",
  "kpi_reporting",
  "internal_scheduling",
];

// Actions requiring explicit approval
export const REQUIRE_APPROVAL_ACTIONS = [
  "external_communication_new",
  "contact_new_customer",
  "publish_adult_content",
  "accept_contract",
  "change_commercial_price",
  "run_paid_ad",
  "purchase_service",
  "financial_payout_request",
];

export interface PermissionCheckResult {
  allowed: boolean;
  category: ActionCategory;
  requiresApproval: boolean;
  reason: string;
  riskLevel: RiskLevel;
}

export async function evaluateActionPermission(
  actionType: string,
  target: string,
  _payload: Record<string, unknown> = {},
  approvalVerified = false
): Promise<PermissionCheckResult> {
  void _payload;

  // 1. Check Global Emergency Stop first
  const emergencyStop = await isEmergencyStopActive();
  if (emergencyStop) {
    return {
      allowed: false,
      category: "FORBIDDEN",
      requiresApproval: false,
      reason: "Hệ thống đang trong chế độ DỪNG KHẨN CẤP (Emergency Stop). Mọi hành động tự động bị đình chỉ.",
      riskLevel: "critical",
    };
  }

  // 2. Check Forbidden Actions (Hard-coded safety guardrails)
  if (FORBIDDEN_ACTIONS.includes(actionType)) {
    return {
      allowed: false,
      category: "FORBIDDEN",
      requiresApproval: false,
      reason: `Hành động '${actionType}' thuộc danh mục BỊ CẤM TUYỆT ĐỐI theo chính sách an toàn của Em Mì.`,
      riskLevel: "critical",
    };
  }

  // 3. Check Explicit Require Approval Actions
  if (REQUIRE_APPROVAL_ACTIONS.includes(actionType)) {
    if (approvalVerified) {
      return {
        allowed: true,
        category: "REQUIRE_APPROVAL",
        requiresApproval: false,
        reason: "Yêu cầu phê duyệt còn hiệu lực và khớp chính xác với payload tác vụ.",
        riskLevel: "high",
      };
    }
    return {
      allowed: false,
      category: "REQUIRE_APPROVAL",
      requiresApproval: true,
      reason: `Hành động '${actionType}' có rủi ro tài chính hoặc pháp lý và cần được Admin phê duyệt trước khi thực thi.`,
      riskLevel: "high",
    };
  }

  // 4. Check database permissions if configured
  if (process.env.NODE_ENV === "test") {
    return {
      allowed: true,
      category: "AUTO_EXECUTE",
      requiresApproval: false,
      reason: "Hành động được phép tự động trong môi trường kiểm thử.",
      riskLevel: "low",
    };
  }

  try {
    const supabase = createAdminClient();
    const fetchPromise = supabase
      .from("permissions")
      .select("action_category")
      .eq("name", actionType)
      .maybeSingle();

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Timeout")), 600);
    });
    const result = await Promise.race([fetchPromise, timeoutPromise]);
    if (timeout) clearTimeout(timeout);
    if (result.error) throw new Error(result.error.message);
    const perm = result.data;

    if (perm) {
      if (perm.action_category === "FORBIDDEN") {
        return {
          allowed: false,
          category: "FORBIDDEN",
          requiresApproval: false,
          reason: `Quyền '${actionType}' đã bị vô hiệu hóa trong hệ thống.`,
          riskLevel: "critical",
        };
      }
      if (perm.action_category === "REQUIRE_APPROVAL") {
        if (approvalVerified) {
          return {
            allowed: true,
            category: "REQUIRE_APPROVAL",
            requiresApproval: false,
            reason: "Yêu cầu phê duyệt còn hiệu lực và khớp chính xác với payload tác vụ.",
            riskLevel: "high",
          };
        }
        return {
          allowed: false,
          category: "REQUIRE_APPROVAL",
          requiresApproval: true,
          reason: `Quyền '${actionType}' yêu cầu Admin phê duyệt.`,
          riskLevel: "high",
        };
      }
      if (perm.action_category === "AUTO_EXECUTE_WITH_LIMITS") {
        return {
          allowed: false,
          category: "REQUIRE_APPROVAL",
          requiresApproval: true,
          reason: "Chưa cấu hình và xác minh đủ hạn mức nền tảng; tác vụ cần Admin phê duyệt.",
          riskLevel: "medium",
        };
      }
    }
  } catch (err) {
    console.error("Could not verify the permission policy; execution is blocked.", err);
    return {
      allowed: false,
      category: "REQUIRE_APPROVAL",
      requiresApproval: true,
      reason: "Không thể xác minh chính sách quyền; cần kiểm tra và phê duyệt thủ công.",
      riskLevel: "high",
    };
  }

  // 5. Default auto-execute check
  if (AUTO_EXECUTE_ACTIONS.includes(actionType)) {
    return {
      allowed: true,
      category: "AUTO_EXECUTE",
      requiresApproval: false,
      reason: "Hành động nội bộ an toàn, được phép tự động thực thi.",
      riskLevel: "low",
    };
  }

  // 6. Unknown external actions require approval by default
  if (approvalVerified) {
    return {
      allowed: true,
      category: "REQUIRE_APPROVAL",
      requiresApproval: false,
      reason: "Tác vụ chưa phân loại đã được phê duyệt với payload không thay đổi.",
      riskLevel: "medium",
    };
  }

  return {
    allowed: false,
    category: "REQUIRE_APPROVAL",
    requiresApproval: true,
    reason: `Hành động chưa được phân loại '${actionType}' yêu cầu xác nhận của Admin.`,
    riskLevel: "medium",
  };
}
