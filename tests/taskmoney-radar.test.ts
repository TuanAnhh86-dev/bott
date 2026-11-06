import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TaskMoneyRadar, VETTED_PAYPAL_RADAR_SITES } from "@/features/taskmoney/radar";

describe("TaskMoney Radar: PayPal Task Earning Discovery", () => {
  it("discovers vetted platforms that all support PayPal withdrawal", () => {
    const opportunities = TaskMoneyRadar.getOpportunities();

    expect(opportunities.length).toBeGreaterThanOrEqual(5);
    for (const site of opportunities) {
      expect(site.paypalSupport).toBe(true);
      expect(site.domain).toBeDefined();
      expect(site.minPayoutUsd).toBeGreaterThan(0);
      expect(site.tosRiskScore).toBeGreaterThanOrEqual(1);
      expect(site.tosRiskScore).toBeLessThanOrEqual(10);
    }
  });

  it("identifies high-demand platforms operating well in Vietnam", () => {
    const freecash = VETTED_PAYPAL_RADAR_SITES.find((s) => s.domain === "freecash.com");
    expect(freecash).toBeDefined();
    expect(freecash?.vietnamEligible).toBe(true);
    expect(freecash?.minPayoutUsd).toBe(5.0);

    const sproutgigs = VETTED_PAYPAL_RADAR_SITES.find((s) => s.domain === "sproutgigs.com");
    expect(sproutgigs).toBeDefined();
    expect(sproutgigs?.vietnamEligible).toBe(true);
    expect(sproutgigs?.category).toBe("microtask");

    const toloka = VETTED_PAYPAL_RADAR_SITES.find((s) => s.domain === "toloka.ai");
    expect(toloka).toBeDefined();
    expect(toloka?.minPayoutUsd).toBe(1.0); // Ultra low threshold
  });

  it("filters platforms by category and maximum risk score", () => {
    const surveysOnly = TaskMoneyRadar.getOpportunities({ category: "survey" });
    expect(surveysOnly.every((s) => s.category === "survey")).toBe(true);

    const lowRiskOnly = TaskMoneyRadar.getOpportunities({ maxRisk: 4 });
    expect(lowRiskOnly.every((s) => s.tosRiskScore <= 4)).toBe(true);
  });

  it("syncs radar platforms without crashing when database is mocked or offline", async () => {
    const syncRes = await TaskMoneyRadar.syncRadarWithDatabase();
    expect(syncRes.synced).toBeGreaterThanOrEqual(0);
  });
});

