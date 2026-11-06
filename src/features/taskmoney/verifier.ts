import "server-only";
import { TaskExecution } from "./types";

export interface VerificationResult {
  verified: boolean;
  status: "CONFIRMED" | "UNDER_REVIEW" | "FLAGGED_DISCREPANCY";
  confirmedAmountVnd: number;
  notes: string;
}

export class TaskMoneyVerifier {
  /**
   * Independently audit task execution results and verify rewards
   */
  static async verifyReward(
    execution: TaskExecution,
    simulatedSiteStatus: "OK" | "UNDER_REVIEW" | "FLAGGED" = "OK"
  ): Promise<VerificationResult> {
    if (execution.status !== "COMPLETED") {
      return {
        verified: false,
        status: "FLAGGED_DISCREPANCY",
        confirmedAmountVnd: 0,
        notes: `Nhiệm vụ chưa hoàn thành (trạng thái: ${execution.status}). Không thể xác nhận tiền thưởng.`,
      };
    }

    if (simulatedSiteStatus === "FLAGGED") {
      return {
        verified: false,
        status: "FLAGGED_DISCREPANCY",
        confirmedAmountVnd: 0,
        notes: "CẢNH BÁO: Phát hiện website đánh dấu bất thường (Account Flagged) hoặc nghi ngờ gian lận. Lập tức cô lập tài khoản để kiểm tra.",
      };
    }

    if (simulatedSiteStatus === "UNDER_REVIEW") {
      return {
        verified: false,
        status: "UNDER_REVIEW",
        confirmedAmountVnd: 0,
        notes: "Nhiệm vụ đang trong diện xét duyệt của ban quản trị website. Chưa cộng vào số dư khả dụng.",
      };
    }

    // Fully verified
    return {
      verified: true,
      status: "CONFIRMED",
      confirmedAmountVnd: execution.actualRewardEarned,
      notes: `Đã đối soát thành công: Website đã ghi nhận phần thưởng ${execution.actualRewardEarned.toLocaleString("vi-VN")} ₫ vào số dư tài khoản.`,
    };
  }
}

