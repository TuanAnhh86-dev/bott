import { NextRequest, NextResponse } from "next/server";
import { MasterOrchestrator } from "@/features/browser/orchestrator";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { isEmergencyStopActive } from "@/lib/security/emergency";
import { TaskStore } from "@/features/agent/task-store";
import { appendLiveEvent, getRecentLiveEvents } from "@/features/browser/events-bus";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const allTasks = await TaskStore.getAllTasks();
    const browserTasks = allTasks.filter(
      (t) =>
        t.task_type === "public_web_research" ||
        t.task_type === "timebucks_survey_run" ||
        t.task_type === "custom_task_mission" ||
        Boolean(t.input_data?.targetUrl)
    );

    return NextResponse.json({
      success: true,
      tasks: browserTasks,
      total: browserTasks.length,
      running: browserTasks.filter((t) => t.status === "RUNNING").length,
      completed: browserTasks.filter((t) => t.status === "COMPLETED").length,
      waitingHuman: browserTasks.filter((t) => t.status === "WAITING_APPROVAL").length,
      failed: browserTasks.filter((t) => t.status === "FAILED").length,
    });
  } catch (error: unknown) {
    console.error("[API Browser Tasks GET Error]:", error);
    return NextResponse.json({ error: "Lỗi tải danh sách tác vụ trình duyệt." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const originError = validateSameOriginJsonRequest(req);
  if (originError) return originError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  if (await isEmergencyStopActive()) {
    return NextResponse.json(
      { error: "Hệ thống đang ở trạng thái Dừng Khẩn Cấp (Emergency Stop). Không thể chạy bot trình duyệt!" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { goal, targetUrl, concurrency = 2 } = body;

    if (!goal || !targetUrl) {
      return NextResponse.json(
        { error: "Vui lòng nhập đầy đủ mục tiêu nhiệm vụ và đường dẫn (URL) trang web." },
        { status: 400 }
      );
    }

    const currentExecutionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const currentTaskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // Execute through Master Orchestrator with real Chromium browser
    const summary = await MasterOrchestrator.dispatchBrowserTask({
      goal: String(goal).trim(),
      targetUrl: String(targetUrl).trim(),
      concurrency: Number(concurrency) || 2,
      onEvent: (eventType, details) => {
        appendLiveEvent({
          id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          executionId: currentExecutionId,
          taskId: currentTaskId,
          botId: "bot_orchestrator",
          eventType,
          url: String(targetUrl).trim(),
          details,
          timestamp: new Date().toISOString(),
        });
      },
    });

    return NextResponse.json({
      success: true,
      executionId: currentExecutionId,
      taskId: currentTaskId,
      summary,
    });
  } catch (error: unknown) {
    console.error("[API Browser Tasks POST Error]:", error);
    const msg = error instanceof Error ? error.message : "Lỗi điều phối nhiệm vụ trình duyệt.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
