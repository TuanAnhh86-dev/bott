import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { RevenueService } from "@/features/revenue/service";
import { requireAdminApi } from "@/lib/security/admin-auth";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const summary = await RevenueService.getSummary();
    const supabase = createAdminClient();
    const { data: records, error } = await supabase
      .from("revenue_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.warn("[Revenue API] Could not load records:", error);
    }

    return NextResponse.json({
      success: true,
      summary,
      records: records || [],
    });
  } catch (err: unknown) {
    console.error("[Revenue API] Error:", err);
    return NextResponse.json(
      {
        success: true,
        summary: {
          verifiedGrossVnd: 0,
          verifiedNetVnd: 0,
          estimatedGrossVnd: 0,
          totalExpensesVnd: 0,
          netProfitVnd: 0,
          pendingPayoutVnd: 0,
        },
        records: [],
      },
      { status: 200 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const schema = z.object({
      revenueType: z.enum(["subscription", "ppv", "royalty", "commission", "sale", "tip", "affiliate", "other"]),
      grossAmountVnd: z.number().positive().max(1_000_000_000),
      platformFeeVnd: z.number().min(0).default(0),
      status: z.enum(["paid", "verified", "pending", "estimated"]).default("paid"),
      evidence: z.string().trim().min(1).max(500),
      verificationMethod: z.string().trim().min(1).max(100).default("manual_verified"),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ", details: parsed.error.issues }, { status: 400 });
    }

    const id = await RevenueService.recordRevenue(parsed.data);

    // Immutable audit log
    try {
      const supabase = createAdminClient();
      await supabase.from("audit_logs").insert({
        actor_id: auth.identity.id,
        actor_role: auth.identity.role,
        action: "revenue_record_created",
        resource_type: "revenue_record",
        resource_id: id,
        metadata: {
          ...parsed.data,
          verifiedAt: new Date().toISOString(),
        },
      });
    } catch (auditErr) {
      console.warn("[Revenue API] Non-fatal audit log warning:", auditErr);
    }

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err: unknown) {
    console.error("[Revenue API] Insert failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Không thể ghi nhận doanh thu." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const resetAll = searchParams.get("reset_all");
    const supabase = createAdminClient();

    if (resetAll === "true") {
      const { error } = await supabase
        .from("revenue_records")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
      return NextResponse.json({ success: true, message: "Đã làm sạch toàn bộ dữ liệu doanh thu về 0 ₫." });
    }

    if (!id) {
      return NextResponse.json({ error: "Thiếu ID bản ghi cần xóa." }, { status: 400 });
    }

    const { error } = await supabase.from("revenue_records").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ success: true, message: "Đã xóa bản ghi doanh thu." });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Không thể xóa bản ghi." },
      { status: 500 }
    );
  }
}
