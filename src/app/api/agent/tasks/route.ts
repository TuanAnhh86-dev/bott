import { NextRequest, NextResponse } from "next/server";
import { TaskStore } from "@/features/agent/task-store";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { z } from "zod";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const tasks = await TaskStore.getAllTasks();
    return NextResponse.json({
      success: true,
      total: tasks.length,
      tasks,
    });
  } catch (err: unknown) {
    console.error("[Tasks API] Could not load tasks:", err);
    return NextResponse.json({ error: "Không thể tải tác vụ lúc này." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const requestError = validateSameOriginJsonRequest(req);
  if (requestError) return requestError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    if (!checkRateLimit(`admin-tasks:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 20, perHour: 200 })) {
      return NextResponse.json({ error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const bodyResult = await readJsonBody(req);
    if (!bodyResult.success) return bodyResult.response;
    const body = z.object({
      action: z.enum(["approve", "cancel", "create", "delete", "assign", "update_progress"]).default("create"),
      taskId: z.string().uuid().optional(),
      reason: z.string().trim().max(500).optional(),
      title: z.string().trim().min(1).max(200).optional(),
      task_type: z.string().trim().min(1).max(100).optional(),
      description: z.string().max(4_000).optional(),
      priority: z.number().int().min(1).max(10000).optional(),
      input_data: z.record(z.string(), z.unknown()).optional(),
      assigned_worker: z.string().trim().max(100).optional(),
      assigned_worker_name: z.string().trim().max(100).optional(),
      progress: z.number().min(0).max(100).optional(),
      current_step: z.string().trim().max(500).optional(),
    }).strict().parse(bodyResult.data);
    const action = body.action || "create";

    if (action === "approve") {
      if (auth.identity.role !== "super_admin") {
        return NextResponse.json({ error: "Chỉ super_admin được phê duyệt tác vụ." }, { status: 403 });
      }
      const { taskId } = body;
      if (!taskId) return NextResponse.json({ error: "Thiếu taskId hợp lệ." }, { status: 400 });
      const ok = await TaskStore.approveTask(taskId, auth.identity.id);
      if (!ok) {
        return NextResponse.json({ error: "Tác vụ không còn đủ điều kiện phê duyệt hoặc yêu cầu đã hết hạn." }, { status: 409 });
      }
      return NextResponse.json({ success: ok, message: "Đã phê duyệt tác vụ" });
    }

    if (action === "cancel") {
      const { taskId, reason } = body;
      if (!taskId) return NextResponse.json({ error: "Thiếu taskId hợp lệ." }, { status: 400 });
      const ok = await TaskStore.cancelTask(taskId, reason);
      return NextResponse.json({ success: ok, message: "Đã hủy tác vụ" });
    }

    if (action === "delete") {
      const { taskId } = body;
      if (!taskId) return NextResponse.json({ error: "Thiếu taskId hợp lệ để xóa." }, { status: 400 });
      const ok = await TaskStore.deleteTask(taskId);
      return NextResponse.json({ success: ok, message: "Đã xóa tác vụ thành công" });
    }

    if (action === "assign") {
      const { taskId, assigned_worker, assigned_worker_name } = body;
      if (!taskId) return NextResponse.json({ error: "Thiếu taskId hợp lệ." }, { status: 400 });
      if (!assigned_worker) return NextResponse.json({ error: "Thiếu thông tin bot/worker được phân công." }, { status: 400 });
      const updated = await TaskStore.assignTask(taskId, assigned_worker, assigned_worker_name);
      if (!updated) return NextResponse.json({ error: "Không tìm thấy tác vụ để phân công." }, { status: 404 });
      return NextResponse.json({
        success: true,
        message: `Đã phân công tác vụ thành công cho ${assigned_worker_name || assigned_worker}`,
        task: updated,
      });
    }

    if (action === "update_progress") {
      const { taskId, progress, current_step } = body;
      if (!taskId) return NextResponse.json({ error: "Thiếu taskId hợp lệ." }, { status: 400 });
      const updated = await TaskStore.updateTaskProgress(taskId, progress ?? 0, current_step);
      if (!updated) return NextResponse.json({ error: "Không tìm thấy tác vụ." }, { status: 404 });
      return NextResponse.json({
        success: true,
        message: "Đã cập nhật tiến độ tác vụ",
        task: updated,
      });
    }

    if (action === "create") {
      const { title, task_type, description, priority, input_data, assigned_worker, assigned_worker_name, progress } = body;
      if (!title) return NextResponse.json({ error: "Tiêu đề tác vụ là bắt buộc." }, { status: 400 });

      const newTask = await TaskStore.addTask({
        title,
        task_type: task_type || "public_web_research",
        description,
        priority: priority ?? 50,
        input_data: input_data || {},
        assigned_worker: assigned_worker || null,
        assigned_worker_name: assigned_worker_name || null,
        progress: progress ?? 0,
        created_by: auth.identity.id,
      });

      return NextResponse.json({
        success: true,
        message: "Đã thêm tác vụ mới vào hàng đợi",
        task: newTask,
      });
    }

    return NextResponse.json({ error: `Hành động không hợp lệ: ${action}` }, { status: 400 });
  } catch (err: unknown) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Yêu cầu task không hợp lệ." }, { status: 400 });
    console.error("[Tasks API] Request failed:", err);
    return NextResponse.json({ error: "Không thể xử lý task lúc này." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const requestError = validateSameOriginJsonRequest(req);
  if (requestError) return requestError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const searchParams = req.nextUrl.searchParams;
    let taskId = searchParams.get("id") || searchParams.get("taskId");

    if (!taskId) {
      const bodyResult = await readJsonBody(req);
      if (bodyResult.success && bodyResult.data) {
        const parsed = z.object({ taskId: z.string().uuid() }).safeParse(bodyResult.data);
        if (parsed.success) {
          taskId = parsed.data.taskId;
        }
      }
    }

    if (!taskId) {
      return NextResponse.json({ error: "Thiếu taskId hợp lệ để xóa." }, { status: 400 });
    }

    const ok = await TaskStore.deleteTask(taskId);
    return NextResponse.json({ success: ok, message: "Đã xóa tác vụ thành công" });
  } catch (err: unknown) {
    console.error("[Tasks API DELETE] Error:", err);
    return NextResponse.json({ error: "Không thể xóa tác vụ lúc này." }, { status: 500 });
  }
}
