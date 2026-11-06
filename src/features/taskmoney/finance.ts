import "server-only";
import { createHash } from "node:crypto";
import { LogicalBalance, WithdrawalRequest } from "./types";
import { encryptSecret, maskDestination } from "./encryption";
import { createAdminClient } from "@/lib/supabase/admin";

export interface CreateWithdrawalInput {
  balanceId: string;
  siteId: string;
  accountId: string;
  destinationType: "paypal" | "bank_transfer" | "crypto_usdt";
  destinationAccount: string; // Plaintext destination, encrypted immediately
  amountVnd: number;
}

export class TaskMoneyFinance {
  /**
   * Calculate deterministic SHA-256 hash binding for withdrawal request
   */
  static computePayloadHash(
    requestId: string,
    balanceId: string,
    amountVnd: number,
    destinationType: string,
    rawDestination: string,
    createdAt: string
  ): string {
    const raw = `${requestId}:${balanceId}:${amountVnd}:${destinationType}:${rawDestination.trim().toLowerCase()}:${createdAt}`;
    return createHash("sha256").update(raw, "utf8").digest("hex");
  }

  /**
   * Draft a withdrawal request pending human review (Finance Agent NEVER auto-withdraws)
   */
  static async createWithdrawalDraft(
    balance: LogicalBalance,
    input: CreateWithdrawalInput
  ): Promise<WithdrawalRequest> {
    if (input.amountVnd <= 0) {
      throw new Error("Số tiền rút phải lớn hơn 0.");
    }

    if (balance.confirmedBalanceVnd < input.amountVnd) {
      throw new Error(`Số dư khả dụng (${balance.confirmedBalanceVnd} ₫) không đủ để rút ${input.amountVnd} ₫.`);
    }

    const requestId = crypto.randomUUID();
    const now = new Date().toISOString();

    const encryptedDestination = encryptSecret(input.destinationAccount);
    const masked = maskDestination(input.destinationType, input.destinationAccount);
    const hash = this.computePayloadHash(
      requestId,
      input.balanceId,
      input.amountVnd,
      input.destinationType,
      input.destinationAccount,
      now
    );

    const draft: WithdrawalRequest = {
      id: requestId,
      balanceId: input.balanceId,
      destinationType: input.destinationType,
      maskedDestination: masked,
      amountVnd: input.amountVnd,
      feeVnd: 0,
      approvalStatus: "PENDING",
      approvalPayloadHash: hash,
      createdAt: now,
    };

    // Lock balance in database to prevent double-spending
    try {
      const supabase = createAdminClient();
      await supabase.from("taskmoney_withdrawal_requests").insert({
        id: draft.id,
        balance_id: draft.balanceId,
        destination_type: draft.destinationType,
        encrypted_destination_details: encryptedDestination,
        masked_destination: draft.maskedDestination,
        amount_vnd: draft.amountVnd,
        fee_vnd: draft.feeVnd,
        approval_status: draft.approvalStatus,
        approval_payload_hash: draft.approvalPayloadHash,
      });

      // Update balance lock
      await supabase
        .from("taskmoney_balances")
        .update({
          confirmed_balance_vnd: balance.confirmedBalanceVnd - input.amountVnd,
          locked_for_withdrawal_vnd: balance.lockedForWithdrawalVnd + input.amountVnd,
          last_reconciliation_at: now,
        })
        .eq("id", input.balanceId);
    } catch (err) {
      console.warn("[TaskMoneyFinance] Draft persistence fallback:", err);
    }

    return draft;
  }

  /**
   * Human approval verification with cryptographic hash check
   */
  static async approveWithdrawal(
    request: WithdrawalRequest,
    rawDestination: string,
    approvedBy: string
  ): Promise<{ approved: boolean; error?: string }> {
    // Recompute hash with exact payload
    const expectedHash = this.computePayloadHash(
      request.id,
      request.balanceId,
      request.amountVnd,
      request.destinationType,
      rawDestination,
      request.createdAt
    );

    if (expectedHash !== request.approvalPayloadHash) {
      return {
        approved: false,
        error: "CẢNH BÁO: Ràng buộc Payload Hash không khớp! Dữ liệu yêu cầu rút tiền đã bị thay đổi trái phép.",
      };
    }

    const now = new Date().toISOString();
    try {
      const supabase = createAdminClient();
      await supabase
        .from("taskmoney_withdrawal_requests")
        .update({
          approval_status: "APPROVED_BY_HUMAN",
          approved_by: approvedBy,
          approved_at: now,
        })
        .eq("id", request.id);

      // Record immutable audit log
      await supabase.from("audit_logs").insert({
        actor_id: approvedBy,
        actor_role: "admin",
        action: "taskmoney_withdrawal_approved",
        entity_name: "taskmoney_withdrawal_requests",
        entity_id: request.id,
        metadata: {
          amount_vnd: request.amountVnd,
          masked_destination: request.maskedDestination,
          approval_payload_hash: request.approvalPayloadHash,
        },
      });
    } catch (err) {
      console.warn("[TaskMoneyFinance] Approval persistence fallback:", err);
    }

    return { approved: true };
  }
}

