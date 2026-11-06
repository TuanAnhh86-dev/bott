import { NextRequest, NextResponse } from "next/server";
import { TaskMoneyOrchestrator } from "@/features/taskmoney/orchestrator";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guardError = validateSameOriginJsonRequest(req);
  if (guardError) return guardError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  if (!checkRateLimit(`taskmoney-analyze:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 20, perHour: 100 })) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu phân tích URL. Vui lòng thử lại sau." }, { status: 429 });
  }

  const bodyResult = await readJsonBody(req);
  if (!bodyResult.success) return bodyResult.response;

  const raw = (bodyResult.data || {}) as Record<string, unknown>;
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  const sampleToSText = typeof raw.sampleToSText === "string" ? raw.sampleToSText : undefined;

  if (!url) {
    return NextResponse.json({ error: "Vui lòng cung cấp URL website nhiệm vụ." }, { status: 400 });
  }

  try {
    const result = await TaskMoneyOrchestrator.evaluateAndPlan(url, sampleToSText);
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (err: unknown) {
    console.error("[TaskMoneyAnalyze] Error analyzing site:", err);
    return NextResponse.json({ error: "Không thể phân tích website lúc này." }, { status: 500 });
  }
}

