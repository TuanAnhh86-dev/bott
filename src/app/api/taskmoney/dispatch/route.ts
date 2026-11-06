import { NextRequest, NextResponse } from "next/server";
import { TaskMoneyExecutor } from "@/features/taskmoney/executor";
import { TaskMoneyVerifier } from "@/features/taskmoney/verifier";
import { TaskMoneyTask } from "@/features/taskmoney/types";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guardError = validateSameOriginJsonRequest(req);
  if (guardError) return guardError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  if (!checkRateLimit(`taskmoney-dispatch:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 30, perHour: 150 })) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu điều phối worker. Vui lòng đợi." }, { status: 429 });
  }

  const bodyResult = await readJsonBody(req);
  if (!bodyResult.success) return bodyResult.response;

  const raw = (bodyResult.data || {}) as Record<string, unknown>;
  const task = raw.task as TaskMoneyTask | undefined;
  const simulateBarrier = (raw.simulateBarrier as "NONE" | "CAPTCHA" | "PHONE_OTP") || "NONE";

  if (!task || !task.id || !task.taskUrl) {
    return NextResponse.json({ error: "Thông tin nhiệm vụ không hợp lệ." }, { status: 400 });
  }

  try {
    // 1. Executor runs task
    const executionResult = await TaskMoneyExecutor.executeTask({
      task,
      simulateBarrier,
    });

    // 2. Verifier audits result if completed
    let verification = null;
    if (executionResult.execution.status === "COMPLETED") {
      verification = await TaskMoneyVerifier.verifyReward(executionResult.execution);
    }

    return NextResponse.json({
      success: true,
      execution: executionResult.execution,
      actionLogs: executionResult.actionLogs,
      needsHumanIntervention: executionResult.needsHumanIntervention,
      verification,
    });
  } catch (err: unknown) {
    console.error("[TaskMoneyDispatch] Execution error:", err);
    return NextResponse.json({ error: "Lỗi thực thi nhiệm vụ." }, { status: 500 });
  }
}

