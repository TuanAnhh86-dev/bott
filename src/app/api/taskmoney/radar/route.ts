import { NextRequest, NextResponse } from "next/server";
import { TaskMoneyRadar } from "@/features/taskmoney/radar";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { validateSameOriginJsonRequest } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const category = url.searchParams.get("category") || undefined;
  const maxRisk = url.searchParams.get("maxRisk") ? Number(url.searchParams.get("maxRisk")) : undefined;

  const sites = TaskMoneyRadar.getOpportunities({ category, maxRisk });

  return NextResponse.json({
    success: true,
    total: sites.length,
    opportunities: sites,
  });
}

export async function POST(req: NextRequest) {
  const guardError = validateSameOriginJsonRequest(req);
  if (guardError) return guardError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const result = await TaskMoneyRadar.syncRadarWithDatabase();
    return NextResponse.json({
      success: true,
      message: `Đã đồng bộ thành công ${result.synced} website nhiệm vụ hỗ trợ PayPal vào cơ sở dữ liệu.`,
      syncedCount: result.synced,
    });
  } catch (err: unknown) {
    console.error("[TaskMoneyRadarAPI] Sync error:", err);
    return NextResponse.json({ error: "Không thể đồng bộ dữ liệu radar lúc này." }, { status: 500 });
  }
}

