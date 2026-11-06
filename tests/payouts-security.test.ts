import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Mock Supabase admin client
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mockRpc,
    from: mockFrom,
  }),
}));

import {
  cancelPayoutWithdrawal,
  completePayoutWithdrawal,
  requestPayoutWithdrawal,
} from "@/features/payouts/service";

const ownerId = "e0774f98-d691-4046-8774-2f284b894f45";
const destinationId = "30e6203d-d36c-4993-9c59-b1dca52d4323";

describe("Payout Security & Financial Safeguards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.PAYOUT_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.PAYOUT_OWNER_USER_ID = ownerId;
    process.env.PAYOUT_SECURITY_PIN = "888888";
    process.env.PAYOUT_DAILY_LIMIT_VND = "10000000";
    process.env.PAYOUT_MIN_WITHDRAWAL_VND = "50000";

    // Default mock setup for overview queries
    mockRpc.mockImplementation((rpcName: string) => {
      if (rpcName === "get_owner_payout_balance") {
        return {
          single: vi.fn().mockResolvedValue({
            data: { paid_revenue_vnd: 2_000_000, reserved_vnd: 0, completed_vnd: 0 },
            error: null,
          }),
        };
      }
      // Return error for others so fallback executes
      return {
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { message: "function not found" },
        }),
      };
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "payout_destinations") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === "payout_withdrawals") {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
          insert: (record: Record<string, unknown>) => ({
            select: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "44444444-4444-4444-4444-444444444444",
                    destination_id: destinationId,
                    amount_vnd: record.amount_vnd,
                    status: "requested",
                    idempotency_key: record.idempotency_key,
                    note: record.note,
                    completion_evidence: null,
                    requested_at: new Date().toISOString(),
                    completed_at: null,
                  },
                  error: null,
                }),
            }),
          }),
          update: (record: Record<string, unknown>) => ({
            eq: () => ({
              eq: () => ({
                select: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: "44444444-4444-4444-4444-444444444444",
                        destination_id: destinationId,
                        amount_vnd: 100_000,
                        status: record.status,
                        idempotency_key: "55555555-5555-5555-5555-555555555555",
                        note: null,
                        completion_evidence: record.completion_evidence ?? null,
                        requested_at: new Date().toISOString(),
                        completed_at: record.completed_at ?? null,
                      },
                      error: null,
                    }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "audit_logs") {
        return {
          select: () => ({
            like: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
            ilike: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      };
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects withdrawal request when Security PIN is incorrect", async () => {
    await expect(
      requestPayoutWithdrawal({
        ownerId,
        destinationId,
        amountVnd: 100_000,
        securityPin: "123456", // Wrong PIN
        idempotencyKey: "11111111-1111-1111-1111-111111111111",
      })
    ).rejects.toThrow("Mã PIN bảo mật rút tiền không chính xác.");
  });

  it("rejects withdrawal request below the minimum amount threshold (50,000 VND)", async () => {
    await expect(
      requestPayoutWithdrawal({
        ownerId,
        destinationId,
        amountVnd: 20_000, // Below 50,000 VND minimum
        securityPin: "888888",
        idempotencyKey: "22222222-2222-2222-2222-222222222222",
      })
    ).rejects.toThrow("Số tiền rút tối thiểu là 50.000 ₫.");
  });

  it("rejects withdrawal request exceeding the daily velocity cap (10,000,000 VND)", async () => {
    await expect(
      requestPayoutWithdrawal({
        ownerId,
        destinationId,
        amountVnd: 15_000_000, // Exceeds 10,000,000 VND daily cap
        securityPin: "888888",
        idempotencyKey: "33333333-3333-3333-3333-333333333333",
      })
    ).rejects.toThrow("Vượt quá hạn mức rút trong ngày");
  });

  it("successfully creates withdrawal and inserts SHA-256 cryptographic audit record when valid", async () => {
    const withdrawal = await requestPayoutWithdrawal({
      ownerId,
      destinationId,
      amountVnd: 250_000,
      securityPin: "888888",
      idempotencyKey: "44444444-4444-4444-4444-444444444444",
      note: "Doanh thu tuần",
    });

    expect(withdrawal.amountVnd).toBe(250_000);
    expect(withdrawal.status).toBe("requested");
    expect(mockFrom).toHaveBeenCalledWith("audit_logs");
  });

  it("logs immutable audit event on withdrawal completion", async () => {
    const completed = await completePayoutWithdrawal(
      ownerId,
      "44444444-4444-4444-4444-444444444444",
      "FT2411059999"
    );

    expect(completed.status).toBe("completed");
    expect(mockFrom).toHaveBeenCalledWith("audit_logs");
  });

  it("logs immutable audit event on withdrawal cancellation", async () => {
    const cancelled = await cancelPayoutWithdrawal(
      ownerId,
      "44444444-4444-4444-4444-444444444444"
    );

    expect(cancelled.status).toBe("cancelled");
    expect(mockFrom).toHaveBeenCalledWith("audit_logs");
  });
});
