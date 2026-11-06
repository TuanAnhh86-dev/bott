import { describe, it, expect, vi, beforeEach } from "vitest";
import { KPIService } from "@/features/kpi/service";
import { RevenueService } from "@/features/revenue/service";
import * as adminModule from "@/lib/supabase/admin";

describe("KPI and Penalty Engine", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { target_vnd: 5000000, year: 2026, month: 11 },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof adminModule.createAdminClient>);
  });

  it("should calculate KPI status when on track", async () => {
    vi.spyOn(RevenueService, "getSummary").mockResolvedValue({
      verifiedGrossVnd: 2500000,
      verifiedNetVnd: 2500000,
      estimatedGrossVnd: 1000000,
      totalExpensesVnd: 100000,
      netProfitVnd: 2400000,
      pendingPayoutVnd: 0,
    });

    const status = await KPIService.getMonthlyStatus(2026, 11);
    expect(status.targetVnd).toBe(5000000);
    expect(status.achievedNetVnd).toBe(2500000);
    expect(status.remainingVnd).toBe(2500000);
    expect(status.completionPct).toBe(50);
    expect(status.simulatedPenaltyVnd).toBeGreaterThanOrEqual(0);
  });

  it("should calculate zero remaining when target is fully achieved", async () => {
    vi.spyOn(RevenueService, "getSummary").mockResolvedValue({
      verifiedGrossVnd: 6000000,
      verifiedNetVnd: 6000000,
      estimatedGrossVnd: 0,
      totalExpensesVnd: 500000,
      netProfitVnd: 5500000,
      pendingPayoutVnd: 0,
    });

    const status = await KPIService.getMonthlyStatus(2026, 11);
    expect(status.achievedNetVnd).toBe(6000000);
    expect(status.remainingVnd).toBe(0);
    expect(status.completionPct).toBe(120);
    expect(status.status).toBe("ahead");
    expect(status.simulatedPenaltyVnd).toBe(0);
  });
});
