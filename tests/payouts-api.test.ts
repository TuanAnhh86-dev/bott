import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/admin-auth", () => ({
  requireAdminApi: vi.fn(),
}));

vi.mock("@/features/payouts/service", () => ({
  addPayoutDestination: vi.fn(),
  cancelPayoutWithdrawal: vi.fn(),
  completePayoutWithdrawal: vi.fn(),
  getPayoutOwnerId: vi.fn(),
  getPayoutOverview: vi.fn(),
  PayoutError: class PayoutError extends Error {
    constructor(message: string, public readonly status: number) {
      super(message);
    }
  },
  requestPayoutWithdrawal: vi.fn(),
}));

import { GET } from "@/app/api/admin/payouts/route";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { getPayoutOwnerId, getPayoutOverview } from "@/features/payouts/service";

const ownerId = "2eb48ec0-62bd-4eba-aed8-6c8c0c097131";

describe("Owner-only payouts API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getPayoutOwnerId).mockReturnValue(ownerId);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies a different authenticated administrator before reading payout data", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({
      identity: { id: "4cfb186b-f493-4fb3-b7d1-6387bf34903e", email: "admin@example.com", role: "admin" },
      response: null,
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(getPayoutOverview).not.toHaveBeenCalled();
  });

  it("returns private no-store data only to the configured owner", async () => {
    const overview = {
      paidRevenueVnd: 100_000,
      reservedVnd: 10_000,
      availableVnd: 90_000,
      dailyLimitVnd: 10_000_000,
      dailyUsedVnd: 0,
      dailyRemainingVnd: 10_000_000,
      destinations: [],
      withdrawals: [],
      auditLogs: [],
    };
    vi.mocked(requireAdminApi).mockResolvedValue({
      identity: { id: ownerId, email: "owner@example.com", role: "super_admin" },
      response: null,
    });
    vi.mocked(getPayoutOverview).mockResolvedValue(overview);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual(overview);
    expect(getPayoutOverview).toHaveBeenCalledWith(ownerId);
  });
});
