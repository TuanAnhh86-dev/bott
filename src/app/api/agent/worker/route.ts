import { NextRequest, NextResponse } from "next/server";
import { workerPool } from "@/features/agent/worker-pool";
import { TaskStore } from "@/features/agent/task-store";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const fleetStatus = workerPool.getFleetStatus();
    const tasks = await TaskStore.getAllTasks();

    const pendingCount = tasks.filter((t) => t.status === "PENDING" || t.status === "QUEUED").length;
    const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;
    const waitingApprovalCount = tasks.filter((t) => t.status === "WAITING_APPROVAL").length;

    return NextResponse.json({
      success: true,
      fleet: fleetStatus.workers,
      fleetStats: fleetStatus,
      queueStats: {
        total: tasks.length,
        pending: pendingCount,
        completed: completedCount,
        waitingApproval: waitingApprovalCount,
      },
    });
  } catch (err: unknown) {
    console.error("[Worker API] Could not load worker status:", err);
    return NextResponse.json({ error: "Không thể tải trạng thái worker." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const requestError = validateSameOriginJsonRequest(req);
  if (requestError) return requestError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  if (auth.identity.role !== "admin" && auth.identity.role !== "super_admin") {
    return NextResponse.json({ error: "Yêu cầu quyền quản trị viên để khởi chạy worker." }, { status: 403 });
  }

  try {
    if (!checkRateLimit(`admin-worker:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 30, perHour: 200 })) {
      return NextResponse.json({ error: "Quá nhiều yêu cầu chạy worker. Vui lòng thử lại sau." }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const bodyResult = await readJsonBody(req);
    if (!bodyResult.success) return bodyResult.response;
    const rawData = (bodyResult.data || {}) as Record<string, unknown>;
    const action = typeof rawData.action === "string" ? rawData.action : "batch";

    // Support executing a specific task for a specific worker
    if (action === "run_single" || (typeof rawData.taskId === "string" && rawData.taskId.length > 0)) {
      const taskId = String(rawData.taskId);
      const workerId = typeof rawData.workerId === "string" && rawData.workerId.length > 0 ? rawData.workerId : undefined;
      const result = await workerPool.executeSingleTask(taskId, workerId);
      const fleetStatus = workerPool.getFleetStatus();
      return NextResponse.json({
        success: true,
        result,
        fleet: fleetStatus.workers,
        fleetStats: fleetStatus,
      });
    }

    const concurrency = typeof rawData.concurrency === "number" ? Math.min(Math.max(rawData.concurrency, 1), 10) : 4;
    const mode = rawData.mode === "single" ? "single" : "parallel";
    const shouldWait = rawData.wait === true;

    if (shouldWait) {
      const batchSummary = await workerPool.runParallelBatch(
        mode === "single" ? 1 : concurrency
      );
      const fleetStatus = workerPool.getFleetStatus();
      return NextResponse.json({
        success: true,
        fleet: fleetStatus.workers,
        fleetStats: fleetStatus,
        batchSummary,
      });
    }

    // Default fast-path: launch batch asynchronously without blocking HTTP socket
    void workerPool.runParallelBatch(mode === "single" ? 1 : concurrency).catch((err) => {
      console.error("[Worker API] Background parallel batch error:", err);
    });

    const fleetStatus = workerPool.getFleetStatus();

    return NextResponse.json({
      success: true,
      started: true,
      fleet: fleetStatus.workers,
      fleetStats: fleetStatus,
    });
  } catch (err: unknown) {
    console.error("Lỗi Worker Pool API:", err);
    return NextResponse.json(
      { error: "Không thể chạy Worker Pool lúc này." },
      { status: 500 }
    );
  }
}
