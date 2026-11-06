import { NextRequest, NextResponse } from "next/server";
import { createAgentPlan } from "@/features/agent/planner";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { z } from "zod";

const plannerRequestSchema = z.object({
  objective: z.string().trim().min(1).max(2_000),
  context: z.string().max(8_000).optional(),
  targetBudgetVnd: z.number().finite().nonnegative().optional(),
}).strict();

export async function POST(req: NextRequest) {
  const requestError = validateSameOriginJsonRequest(req);
  if (requestError) return requestError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    if (!checkRateLimit(`admin-planner:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 3, perHour: 20 })) {
      return NextResponse.json({ error: "Quá nhiều yêu cầu lập kế hoạch. Vui lòng thử lại sau." }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const bodyResult = await readJsonBody(req);
    if (!bodyResult.success) return bodyResult.response;
    const parsed = plannerRequestSchema.safeParse(bodyResult.data);
    if (!parsed.success) return NextResponse.json({ error: "Yêu cầu lập kế hoạch không hợp lệ." }, { status: 400 });

    const plan = await createAgentPlan({
      ...parsed.data,
      actorId: auth.identity.id,
    });

    return NextResponse.json({ success: true, plan });
  } catch (err: unknown) {
    console.error("Lỗi API Agent Planner:", err);
    return NextResponse.json(
      { error: "Không thể tạo kế hoạch lúc này." },
      { status: 500 }
    );
  }
}
