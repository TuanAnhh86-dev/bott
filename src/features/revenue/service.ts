import { createAdminClient } from "@/lib/supabase/admin";
import { RevenueRecord, RevenueStatus } from "@/types";

export interface FinancialSummary {
  verifiedGrossVnd: number;
  verifiedNetVnd: number;
  estimatedGrossVnd: number;
  totalExpensesVnd: number;
  netProfitVnd: number;
  pendingPayoutVnd: number;
}

export class RevenueService {
  static async getSummary(year?: number, month?: number): Promise<FinancialSummary> {
    const supabase = createAdminClient();
    const now = new Date();
    const currentYear = year ?? now.getFullYear();
    const currentMonth = month ?? now.getMonth() + 1;
    if (!Number.isInteger(currentYear) || currentYear < 2000 || currentYear > 9999 ||
        !Number.isInteger(currentMonth) || currentMonth < 1 || currentMonth > 12) {
      throw new Error("Invalid revenue reporting period.");
    }

    const startDate = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
    const nextMonth = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth, 0).toISOString().slice(0, 10);
    const nextMonthStart = nextMonth.toISOString().slice(0, 10);

    let records: RevenueRecord[] = [];
    try {
      const { data, error } = await supabase
        .from("revenue_records")
        .select("*")
        .lte("period_start", endDate)
        .gte("period_end", startDate);
      if (!error && data) records = data as RevenueRecord[];
    } catch (err) {
      console.warn("[RevenueService] Could not load revenue records from DB:", err);
    }

    let expenses: Array<{ amount_vnd: number | string; status: string }> = [];
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount_vnd, status")
        .eq("status", "actual")
        .gte("occurred_at", `${startDate}T00:00:00.000Z`)
        .lt("occurred_at", `${nextMonthStart}T00:00:00.000Z`);
      if (!error && data) expenses = data;
    } catch (err) {
      console.warn("[RevenueService] Could not load expenses from DB:", err);
    }

    let verifiedGrossVnd = 0;
    let verifiedNetVnd = 0;
    let estimatedGrossVnd = 0;
    let pendingPayoutVnd = 0;

    (records || []).forEach((r: RevenueRecord) => {
      const gross = Number(r.gross_amount_vnd) || 0;
      const net = Number(r.net_amount_vnd) || 0;

      if (r.status === "verified" || r.status === "paid") {
        verifiedGrossVnd += gross;
        verifiedNetVnd += net;
      } else if (r.status === "estimated") {
        estimatedGrossVnd += gross;
      } else if (r.status === "pending") {
        pendingPayoutVnd += net;
      }
    });

    const totalExpensesVnd = (expenses || []).reduce(
      (sum, e) => sum + (Number(e.amount_vnd) || 0),
      0
    );

    const netProfitVnd = verifiedNetVnd - totalExpensesVnd;

    return {
      verifiedGrossVnd,
      verifiedNetVnd,
      estimatedGrossVnd,
      totalExpensesVnd,
      netProfitVnd,
      pendingPayoutVnd,
    };
  }

  static async recordRevenue(entry: {
    platformId?: string;
    businessModelId?: string;
    revenueType: "subscription" | "ppv" | "royalty" | "commission" | "sale" | "tip" | "affiliate" | "other";
    grossAmountVnd: number;
    platformFeeVnd?: number;
    status: RevenueStatus;
    evidence?: string;
    verificationMethod?: string;
    currencyOriginal?: string;
    amountOriginal?: number;
  }): Promise<string> {
    const supabase = createAdminClient();
    if (!Number.isFinite(entry.grossAmountVnd) || entry.grossAmountVnd < 0) {
      throw new Error("Gross revenue must be a non-negative finite amount.");
    }
    const fee = entry.platformFeeVnd ?? 0;
    if (!Number.isFinite(fee) || fee < 0 || fee > entry.grossAmountVnd) {
      throw new Error("Platform fee must be between zero and gross revenue.");
    }
    const now = new Date();
    const periodStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("revenue_records")
      .insert({
        platform_id: entry.platformId || null,
        business_model_id: entry.businessModelId || null,
        revenue_type: entry.revenueType,
        gross_amount_vnd: entry.grossAmountVnd,
        platform_fee_vnd: fee,
        status: entry.status,
        currency_original: entry.currencyOriginal || "VND",
        amount_original: entry.amountOriginal ?? entry.grossAmountVnd,
        evidence: entry.evidence || null,
        verification_method: entry.verificationMethod || (entry.status === "verified" ? "admin_confirmed" : "manual_estimate"),
        verified_at: entry.status === "verified" || entry.status === "paid" ? now.toISOString() : null,
        period_start: periodStart,
        period_end: periodEnd,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(`Lỗi khi ghi nhận doanh thu: ${error.message}`);
    }

    return data.id;
  }
}
