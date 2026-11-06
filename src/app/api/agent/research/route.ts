import { NextRequest, NextResponse } from "next/server";
import { executeResearch, getCachedResearchReports } from "@/features/agent/research";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { z } from "zod";

const researchRequestSchema = z.object({
  topic: z.string().trim().min(1).max(500),
  platformFocus: z.string().trim().max(100).optional(),
}).strict();

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const reports = getCachedResearchReports();
    return NextResponse.json({
      success: true,
      total: reports.length,
      reports,
    });
  } catch (err: unknown) {
    console.error("[Research API] Could not load cached reports:", err);
    return NextResponse.json({ error: "Không thể tải báo cáo nghiên cứu." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const requestError = validateSameOriginJsonRequest(req);
  if (requestError) return requestError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    if (!checkRateLimit(`admin-research:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 3, perHour: 30 })) {
      return NextResponse.json({ error: "Quá nhiều yêu cầu nghiên cứu. Vui lòng thử lại sau." }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const bodyResult = await readJsonBody(req);
    if (!bodyResult.success) return bodyResult.response;
    const parsed = researchRequestSchema.safeParse(bodyResult.data);
    if (!parsed.success) return NextResponse.json({ error: "Chủ đề nghiên cứu không hợp lệ." }, { status: 400 });

    const report = await executeResearch(parsed.data.topic, parsed.data.platformFocus);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: unknown) {
    console.error("[Research API] Research failed:", err);
    return NextResponse.json({ error: "Không thể hoàn thành nghiên cứu lúc này." }, { status: 500 });
  }
}
