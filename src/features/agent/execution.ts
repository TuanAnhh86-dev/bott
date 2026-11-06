import { createAdminClient } from "@/lib/supabase/admin";
import { Task, TaskStatus } from "@/types";
import { isEmergencyStopActive } from "@/lib/security/emergency";
import { evaluateActionPermission } from "@/lib/security/permissions";
import { executeResearch } from "./research";
import { TaskStore } from "./task-store";
import { executeResilientText } from "@/lib/ai/client";

export interface ExecutionResult {
  taskId: string;
  success: boolean;
  newStatus: TaskStatus;
  result?: Record<string, unknown>;
  error?: string;
}

async function recordTaskEvent(
  task: Task,
  eventType: string,
  newStatus: TaskStatus,
  data?: Record<string, unknown>
) {
  const { error } = await createAdminClient().from("task_events").insert({
    task_id: task.id,
    event_type: eventType,
    previous_status: task.status,
    new_status: newStatus,
    data: data ?? {},
  });
  if (error) throw new Error(`Could not record task event: ${error.message}`);
}

export class TaskExecutionEngine {
  static async processNextTask(): Promise<ExecutionResult | null> {
    if (await isEmergencyStopActive()) return null;

    const supabase = createAdminClient();
    const { data: pauseSetting, error: settingsError } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "agent.global_pause")
      .maybeSingle();
    if (settingsError) throw new Error(`Could not verify global pause: ${settingsError.message}`);
    if (pauseSetting?.value === true || pauseSetting?.value === "true") return null;

    const [currentTask] = await TaskStore.claimPendingTasks(1);
    if (!currentTask) return null;

    try {
      const approvalVerified = await TaskStore.isTaskApprovalValid(currentTask);
      const permission = await evaluateActionPermission(
        currentTask.task_type,
        currentTask.title,
        currentTask.input_data,
        approvalVerified
      );

      if (permission.requiresApproval) {
        try {
          await TaskStore.requestTaskApproval(currentTask.id);
        } catch (error) {
          console.error(`[TaskExecutionEngine] Could not persist approval request for task ${currentTask.id}:`, error);
          await TaskStore.updateTask(currentTask.id, {
            status: "FAILED",
            error_details: "Could not persist the required approval request.",
          });
          await recordTaskEvent(currentTask, "APPROVAL_REQUEST_FAILED", "FAILED");
          return {
            taskId: currentTask.id,
            success: false,
            newStatus: "FAILED",
            error: "Could not persist the required approval request.",
          };
        }
        await recordTaskEvent(currentTask, "APPROVAL_REQUIRED", "WAITING_APPROVAL");
        return {
          taskId: currentTask.id,
          success: false,
          newStatus: "WAITING_APPROVAL",
          error: "Yêu cầu phê duyệt từ Quản trị viên trước khi tiếp tục.",
        };
      }

      if (!permission.allowed) {
        await TaskStore.updateTask(currentTask.id, {
          status: "CANCELLED",
          error_details: permission.reason,
        });
        await recordTaskEvent(currentTask, "EXECUTION_BLOCKED", "CANCELLED", {
          reason: permission.reason,
        });
        return {
          taskId: currentTask.id,
          success: false,
          newStatus: "CANCELLED",
          error: permission.reason,
        };
      }

      await recordTaskEvent(currentTask, "EXECUTION_STARTED", "RUNNING");
      let result: Record<string, unknown>;

      if (currentTask.task_type === "public_web_research" || currentTask.task_type.includes("research")) {
        result = { ...(await executeResearch(currentTask.description || currentTask.title)) };
      } else if (currentTask.task_type === "content_drafting" || currentTask.task_type.includes("content")) {
        const res = await executeResilientText({
          prompt: `Bạn là trợ lý sáng tạo nội dung của Em Mì.
Nhiệm vụ: ${currentTask.title}
Mô tả: ${currentTask.description || ""}

Hãy tạo:
1. Tiêu đề thương mại cuốn hút
2. Bộ 10 Prompt mẫu chi tiết kèm thông số kỹ thuật (Midjourney / SD)
3. Mô tả sản phẩm chào bán
4. Mức giá khuyến nghị bằng USD và VND
5. Thẻ từ khóa (Tags)`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.7,
        });
        result = { content: res.text, modelUsed: res.modelUsed };
      } else if (currentTask.task_type === "digital_product_pack" || currentTask.task_type.includes("product")) {
        const res = await executeResilientText({
          prompt: `Bạn là chuyên gia đóng gói sản phẩm số của Em Mì.
Nhiệm vụ: ${currentTask.title}
Mô tả: ${currentTask.description || ""}

Hãy đóng gói một sản phẩm số hoàn chỉnh sẵn sàng thương mại hóa:
1. Tên sản phẩm thương mại & Slogan cuốn hút
2. Mục lục chi tiết 5 phần cốt lõi
3. Bản thảo nội dung chi tiết & hướng dẫn thực hành
4. Bộ 15 Prompt / Mẫu thực thi đi kèm
5. Trang bán hàng & Báo giá khuyến nghị`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.6,
        });
        result = { digitalProduct: res.text, modelUsed: res.modelUsed };
      } else if (currentTask.task_type === "affiliate_campaign_draft" || currentTask.task_type.includes("affiliate")) {
        const res = await executeResilientText({
          prompt: `Bạn là chuyên gia Affiliate Marketing của Em Mì.
Nhiệm vụ: ${currentTask.title}
Mô tả: ${currentTask.description || ""}

Hãy xây dựng chiến dịch tiếp thị liên kết hoàn chỉnh:
1. Chiến lược sản phẩm ngách & đối tượng mục tiêu
2. Kịch bản Video ngắn 45s kèm Hook và CTA
3. Bài viết review phân tích
4. Vị trí đặt link tối ưu CTR
5. Dự phóng hoa hồng kỳ vọng`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.6,
        });
        result = { affiliateCampaign: res.text, modelUsed: res.modelUsed };
      } else if (currentTask.task_type === "seo_metadata" || currentTask.task_type.includes("seo")) {
        const res = await executeResilientText({
          prompt: `Tạo bộ 35 từ khóa SEO thương mại tiếng Anh & tiếng Việt cho chủ đề: "${currentTask.title}". Phân loại Primary, Long-tail, High-Intent Keywords.`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.4,
        });
        result = { seoKeywords: res.text };
      } else if (currentTask.task_type === "internal_calculation" || currentTask.task_type.includes("calc")) {
        const input = currentTask.input_data ?? {};
        const grossAmountVnd =
          typeof input.grossAmountVnd === "number" && Number.isFinite(input.grossAmountVnd) && input.grossAmountVnd >= 0
            ? input.grossAmountVnd
            : 5000000;
        const platformFeeVnd =
          typeof input.platformFeeVnd === "number" &&
          Number.isFinite(input.platformFeeVnd) &&
          input.platformFeeVnd >= 0 &&
          input.platformFeeVnd <= grossAmountVnd
            ? input.platformFeeVnd
            : Math.round(grossAmountVnd * 0.1);
        result = {
          simulationOnly: true,
          grossAmountVnd,
          platformFeeVnd,
          netAmountVnd: grossAmountVnd - platformFeeVnd,
        };
      } else {
        throw new Error(`Unsupported task type: ${currentTask.task_type}`);
      }

      const updatedTask = await TaskStore.updateTask(currentTask.id, {
        status: "COMPLETED",
        result,
        completed_at: new Date().toISOString(),
      });
      if (!updatedTask) throw new Error("Task disappeared before completion could be saved.");

      // Credit revenue if task is a verified commercial order (Never fabricate fake money)
      try {
        const rawOutput = (result || {}) as Record<string, unknown>;
        if (currentTask.task_type === "internal_calculation") {
          // Simulation calculations are NEVER marked as paid revenue
          await createAdminClient().from("revenue_records").insert({
            revenue_type: "commission",
            status: "estimated",
            gross_amount_vnd: typeof rawOutput.grossAmountVnd === "number" ? rawOutput.grossAmountVnd : 0,
            platform_fee_vnd: typeof rawOutput.platformFeeVnd === "number" ? rawOutput.platformFeeVnd : 0,
            evidence: `Mô phỏng tài chính (Không ghi nhận doanh thu thực): ${currentTask.title}`,
            verification_method: "financial_simulation_only",
            period_start: new Date().toISOString().slice(0, 10),
            period_end: new Date().toISOString().slice(0, 10),
            metadata: { simulationOnly: true },
          });
        } else {
          // Check if there is an explicit commercial order or sale price attached to the task
          const inputOrderVnd =
            typeof currentTask.input_data?.orderAmountVnd === "number"
              ? currentTask.input_data.orderAmountVnd
              : typeof currentTask.input_data?.salePriceVnd === "number"
              ? currentTask.input_data.salePriceVnd
              : null;

          if (inputOrderVnd !== null && inputOrderVnd > 0) {
            const revType =
              currentTask.task_type === "digital_product_pack" || currentTask.task_type === "content_drafting"
                ? "sale"
                : currentTask.task_type === "seo_metadata"
                ? "royalty"
                : "affiliate";

            await createAdminClient().from("revenue_records").insert({
              revenue_type: revType,
              status: "paid",
              gross_amount_vnd: inputOrderVnd,
              platform_fee_vnd: Math.round(inputOrderVnd * 0.1),
              evidence: `Đơn hàng thương mại đã hoàn tất: ${currentTask.title}`,
              verification_method: "task_execution_engine",
              verified_at: new Date().toISOString(),
              period_start: new Date().toISOString().slice(0, 10),
              period_end: new Date().toISOString().slice(0, 10),
            });
          }
        }
      } catch (revErr) {
        console.warn("[TaskExecutionEngine] Could not insert revenue record:", revErr);
      }
      await recordTaskEvent(currentTask, "EXECUTION_COMPLETED", "COMPLETED");

      return { taskId: currentTask.id, success: true, newStatus: "COMPLETED", result };
    } catch (error) {
      console.error(`[TaskExecutionEngine] Task ${currentTask.id} failed:`, error);
      const retryCount = currentTask.retry_count + 1;
      const nextStatus: TaskStatus = retryCount <= currentTask.max_retries ? "QUEUED" : "FAILED";
      const errorMessage = error instanceof Error ? error.message : "Unknown task execution error.";
      await TaskStore.updateTask(currentTask.id, {
        status: nextStatus,
        retry_count: retryCount,
        error_details: errorMessage,
      });
      await recordTaskEvent(currentTask, nextStatus === "QUEUED" ? "RETRY_SCHEDULED" : "EXECUTION_FAILED", nextStatus, {
        error: errorMessage,
        retryCount,
      });
      return {
        taskId: currentTask.id,
        success: false,
        newStatus: nextStatus,
        error: errorMessage,
      };
    }
  }
}
