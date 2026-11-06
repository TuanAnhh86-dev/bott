import { createAdminClient } from "@/lib/supabase/admin";
import { RevenueService } from "../revenue/service";

export interface KPIDetailedStatus {
  year: number;
  month: number;
  targetVnd: number;
  achievedNetVnd: number;
  remainingVnd: number;
  completionPct: number;
  dailyTargetVnd: number;
  requiredDailyAverageVnd: number;
  daysInMonth: number;
  daysPassed: number;
  daysRemaining: number;
  status: "ahead" | "on_track" | "behind" | "critical";
  simulatedPenaltyVnd: number;
}

export class KPIService {
  static async getMonthlyStatus(year?: number, month?: number): Promise<KPIDetailedStatus> {
    const supabase = createAdminClient();
    const now = new Date();
    const currentYear = year ?? now.getFullYear();
    const currentMonth = month ?? now.getMonth() + 1;
    if (!Number.isInteger(currentYear) || currentYear < 2000 || currentYear > 9999 ||
        !Number.isInteger(currentMonth) || currentMonth < 1 || currentMonth > 12) {
      throw new Error("Invalid KPI reporting period.");
    }

    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const isCurrentMonth = now.getFullYear() === currentYear && now.getMonth() + 1 === currentMonth;
    const isFutureMonth = currentYear > now.getFullYear() ||
      (currentYear === now.getFullYear() && currentMonth > now.getMonth() + 1);
    const daysPassed = isCurrentMonth ? now.getDate() : isFutureMonth ? 0 : daysInMonth;
    const daysRemaining = isCurrentMonth ? daysInMonth - now.getDate() : isFutureMonth ? daysInMonth : 0;

    let targetVnd = 5000000;
    try {
      const { data: kpiRecord, error: kpiError } = await supabase
        .from("monthly_kpis")
        .select("*")
        .eq("year", currentYear)
        .eq("month", currentMonth)
        .maybeSingle();
      if (!kpiError && kpiRecord) {
        const val = Number(kpiRecord.target_vnd);
        if (Number.isFinite(val) && val >= 0) targetVnd = val;
      }
    } catch (kpiError) {
      console.warn("[KPIService] Could not load KPI settings, using default 5M:", kpiError);
    }

    // Get current verified revenue
    let achievedNetVnd = 0;
    try {
      const summary = await RevenueService.getSummary(currentYear, currentMonth);
      achievedNetVnd = summary.verifiedNetVnd;
    } catch (revError) {
      console.warn("[KPIService] Could not load revenue summary:", revError);
    }
    const remainingVnd = Math.max(0, targetVnd - achievedNetVnd);
    const completionPct = targetVnd > 0 ? (achievedNetVnd / targetVnd) * 100 : 100;

    const dailyTargetVnd = targetVnd / daysInMonth;
    const requiredDailyAverageVnd = daysRemaining > 0 ? remainingVnd / daysRemaining : 0;

    // Calculate pace status
    const expectedPacePct = (daysPassed / daysInMonth) * 100;
    let status: "ahead" | "on_track" | "behind" | "critical" = "on_track";

    if (completionPct >= 100 || completionPct >= expectedPacePct + 10) {
      status = "ahead";
    } else if (completionPct >= expectedPacePct - 15) {
      status = "on_track";
    } else if (completionPct >= expectedPacePct - 35) {
      status = "behind";
    } else {
      status = "critical";
    }

    // Simulated penalty calculation (e.g. 5% of shortfall if behind schedule)
    const shortfallVnd = Math.max(0, (targetVnd * (expectedPacePct / 100)) - achievedNetVnd);
    const simulatedPenaltyVnd = Math.round(shortfallVnd * 0.05);

    return {
      year: currentYear,
      month: currentMonth,
      targetVnd,
      achievedNetVnd,
      remainingVnd,
      completionPct: Math.round(completionPct * 10) / 10,
      dailyTargetVnd: Math.round(dailyTargetVnd),
      requiredDailyAverageVnd: Math.round(requiredDailyAverageVnd),
      daysInMonth,
      daysPassed,
      daysRemaining,
      status,
      simulatedPenaltyVnd,
    };
  }
}
