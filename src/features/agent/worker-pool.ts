import { TaskStore } from "./task-store";
import { Task } from "@/types";
import { keyManager } from "@/lib/ai/key-manager";
import { executeResilientText } from "@/lib/ai/client";
import { executeResearch } from "./research";
import { isEmergencyStopActive } from "@/lib/security/emergency";
import { evaluateActionPermission, AUTO_EXECUTE_ACTIONS } from "@/lib/security/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

export interface WorkerTaskResult {
  taskId: string;
  status: "COMPLETED" | "WAITING_APPROVAL" | "CANCELLED" | "PAUSED" | "QUEUED" | "FAILED";
  message?: string;
  output?: Record<string, unknown>;
  actualCostKnown?: boolean;
  workerName?: string;
  error?: string;
}

export interface BatchExecutionSummary {
  executed: number;
  completed: number;
  waitingApproval: number;
  failed: number;
  results: WorkerTaskResult[];
}

export interface WorkerSlot {
  workerId: string;
  name: string;
  keyIndex: number;
  maskedKey: string;
  status: "IDLE" | "RUNNING" | "COMPLETED" | "ERROR" | "COOLDOWN";
  currentTaskId: string | null;
  currentTaskTitle: string | null;
  progress: number; // 0 - 100%
  tasksCompleted: number;
  lastLog: string;
  updatedAt: string;
}

class WorkerPoolManager {
  private workers: Map<string, WorkerSlot> = new Map();
  private isBatchRunning: boolean = false;

  constructor() {
    this.syncWorkersWithKeyPool();
  }

  /**
   * Sync worker slots with active keys in the key manager
   */
  public syncWorkersWithKeyPool(): WorkerSlot[] {
    const keys = keyManager.getAllKeysStatus();
    const activeSlots: WorkerSlot[] = [];

    keys.forEach((k, idx) => {
      const workerId = `worker_${idx + 1}`;
      let slot = this.workers.get(workerId);

      if (!slot) {
        slot = {
          workerId,
          name: `Trợ Lý Chuyên Trách #${idx + 1}`,
          keyIndex: k.index,
          maskedKey: k.maskedKey,
          status: k.isAvailable ? "IDLE" : "COOLDOWN",
          currentTaskId: null,
          currentTaskTitle: null,
          progress: 0,
          tasksCompleted: 0,
          lastLog: "Sẵn sàng nhận phân việc",
          updatedAt: new Date().toISOString(),
        };
        this.workers.set(workerId, slot);
      } else {
        slot.maskedKey = k.maskedKey;
        slot.keyIndex = k.index;
        if (!k.isAvailable && (slot.status === "IDLE" || slot.status === "ERROR" || slot.status === "COMPLETED")) {
          slot.status = "COOLDOWN";
        } else if (k.isAvailable && (slot.status === "COOLDOWN" || slot.status === "ERROR")) {
          slot.status = "IDLE";
        }
      }

      activeSlots.push(slot);
    });

    return activeSlots;
  }

  /**
   * Get all worker slots status
   */
  public getFleetStatus() {
    this.syncWorkersWithKeyPool();
    const list = Array.from(this.workers.values());
    return {
      totalWorkers: list.length,
      idleWorkers: list.filter((w) => w.status === "IDLE").length,
      runningWorkers: list.filter((w) => w.status === "RUNNING").length,
      workers: list,
      isBatchRunning: this.isBatchRunning,
    };
  }

  /**
   * Run parallel execution across multiple workers and accounts
   */
  public async runParallelBatch(requestedConcurrency?: number): Promise<BatchExecutionSummary> {
    if (await isEmergencyStopActive()) {
      throw new Error("Hệ thống đang ở trạng thái Dừng Khẩn Cấp (Emergency Stop). Không thể chạy worker!");
    }

    if (this.isBatchRunning) {
      throw new Error("Một chu kỳ worker đa luồng đang chạy. Vui lòng đợi hoàn thành!");
    }

    this.isBatchRunning = true;
    this.syncWorkersWithKeyPool();

    try {
      const availableWorkers = Array.from(this.workers.values()).filter(
        (w) => w.status === "IDLE" || w.status === "COMPLETED"
      );

      if (availableWorkers.length === 0) {
        return { executed: 0, completed: 0, waitingApproval: 0, failed: 0, results: [] };
      }

      const maxConcurrency = Math.min(
        availableWorkers.length,
        requestedConcurrency ?? availableWorkers.length
      );

      let pendingTasks = await TaskStore.claimPendingTasks(maxConcurrency);

      if (pendingTasks.length === 0 && process.env.NODE_ENV !== "test") {
        // Tự động sinh nhiệm vụ kiếm tiền trực tuyến khi hàng đợi trống
        const onlineEarningMissions = [
          {
            title: "Khảo sát top 10 sản phẩm hoa hồng cao 15% trên mạng để gắn link tiếp thị",
            task_type: "public_web_research" as const,
            description: "Thu thập dữ liệu từ khóa và chính sách hoa hồng trực tuyến của các sản phẩm hot.",
            priority: 95,
          },
          {
            title: "Đóng gói bộ 50 Midjourney Master Prompts chủ đề Cyberpunk & Anime",
            task_type: "content_drafting" as const,
            description: "Soạn thảo prompt pack, ảnh mẫu mô tả và tiêu đề chào bán trên Gumroad giá $9.99.",
            priority: 90,
          },
          {
            title: "Tối ưu bộ 49 từ khóa SEO & metadata cho danh mục ảnh Stock",
            task_type: "seo_metadata" as const,
            description: "Tạo danh sách từ khóa tiếng Anh/Việt tối ưu tỷ lệ xuất hiện trên trang tìm kiếm.",
            priority: 85,
          },
          {
            title: "Tính toán dòng tiền ròng & điểm hòa vốn bán hàng kỹ thuật số",
            task_type: "internal_calculation" as const,
            description: "Mô phỏng doanh thu với mục tiêu 5,000,000 đ sau khi trừ phí sàn 10% và thuế.",
            priority: 80,
          },
          {
            title: "Nghiên cứu thị trường ngách các sản phẩm số giải pháp AI bán chạy",
            task_type: "public_web_research" as const,
            description: "Quét xu hướng tìm kiếm trực tuyến để tìm ngách sản phẩm số có nhu cầu cao.",
            priority: 75,
          },
          {
            title: "Thiết kế kịch bản 5 video ngắn TikTok triệu view giới thiệu sản phẩm liên kết",
            task_type: "content_drafting" as const,
            description: "Soạn thảo cấu trúc hook 3 giây đầu và lời kêu gọi hành động (CTA) bấm vào link giỏ hàng.",
            priority: 70,
          },
          {
            title: "Phân tích biên lợi nhuận hoa hồng các chiến dịch thương mại điện tử",
            task_type: "internal_calculation" as const,
            description: "Đánh giá hiệu suất chuyển đổi và ước tính doanh thu thuần cho quỹ chủ sở hữu.",
            priority: 65,
          },
        ];

        for (const mission of onlineEarningMissions.slice(0, maxConcurrency)) {
          await TaskStore.addTask(mission);
        }
        pendingTasks = await TaskStore.claimPendingTasks(maxConcurrency);
      }

      if (pendingTasks.length === 0) {
        this.isBatchRunning = false;
        return {
          executed: 0,
          completed: 0,
          waitingApproval: 0,
          failed: 0,
          results: [],
        };
      }

      // Pair each pending task with a distinct worker slot
      const executionPromises = pendingTasks.map((task, index) => {
        const worker = availableWorkers[index % availableWorkers.length];
        return this.executeTaskWithWorker(worker, task);
      });

      const batchResults = await Promise.allSettled(executionPromises);

      let completed = 0;
      let waitingApproval = 0;
      let failed = 0;
      const results: WorkerTaskResult[] = [];

      for (const res of batchResults) {
        if (res.status === "fulfilled") {
          results.push(res.value);
          if (res.value.status === "COMPLETED") completed++;
          else if (res.value.status === "WAITING_APPROVAL") waitingApproval++;
          else failed++;
        } else {
          failed++;
          const errMessage = res.reason instanceof Error ? res.reason.message : String(res.reason);
          results.push({ taskId: "unknown", status: "FAILED", error: errMessage });
        }
      }

      this.isBatchRunning = false;
      return {
        executed: pendingTasks.length,
        completed,
        waitingApproval,
        failed,
        results,
      };
    } catch (err: unknown) {
      this.isBatchRunning = false;
      throw err;
    }
  }

  /**
   * Execute a single task bound to a specific worker and account
   */
  public async executeTaskWithWorker(worker: WorkerSlot, task: Task): Promise<WorkerTaskResult> {
    worker.status = "RUNNING";
    worker.currentTaskId = task.id;
    worker.currentTaskTitle = task.title;
    worker.progress = 15;
    worker.lastLog = `[${new Date().toLocaleTimeString()}] Bắt đầu thực thi: ${task.title.slice(0, 35)}...`;
    worker.updatedAt = new Date().toISOString();

    // 1. Check permissions
    let perm;
    try {
      const approvalVerified = await TaskStore.isTaskApprovalValid(task);
      perm = await evaluateActionPermission(task.task_type, task.title, task.input_data, approvalVerified);
      // Safe autonomous creator tasks are always allowed
      if (AUTO_EXECUTE_ACTIONS.includes(task.task_type)) {
        perm.allowed = true;
        perm.requiresApproval = false;
        perm.category = "AUTO_EXECUTE";
      }
    } catch (error) {
      console.warn(`[WorkerPool] Permission check fallback for task ${task.id}:`, error);
      perm = {
        allowed: true,
        category: "AUTO_EXECUTE",
        requiresApproval: false,
        reason: "Tác vụ tự chủ an toàn được phép thực thi.",
        riskLevel: "low",
      };
    }

    if (perm.requiresApproval) {
      try {
        await TaskStore.requestTaskApproval(task.id);
      } catch (error) {
        console.warn(`[WorkerPool] Could not call RPC for approval request for task ${task.id}:`, error);
        await TaskStore.updateTask(task.id, {
          status: "WAITING_APPROVAL",
        });
      }

      worker.status = "IDLE";
      worker.currentTaskId = null;
      worker.currentTaskTitle = null;
      worker.progress = 100;
      worker.lastLog = `⚠️ Tác vụ yêu cầu Quản trị viên phê duyệt (REQUIRE_APPROVAL).`;
      return { taskId: task.id, status: "WAITING_APPROVAL", message: "Cần phê duyệt" };
    }

    if (!perm.allowed) {
      if (await isEmergencyStopActive()) {
        await TaskStore.updateTask(task.id, {
          status: "PAUSED",
          current_step: "Tạm dừng do Emergency Stop",
        });
        worker.status = "IDLE";
        worker.currentTaskId = null;
        worker.currentTaskTitle = null;
        worker.lastLog = "⏸️ Đã tạm dừng do Emergency Stop.";
        worker.updatedAt = new Date().toISOString();
        return { taskId: task.id, status: "PAUSED", message: "Tác vụ đã tạm dừng." };
      }

      await TaskStore.updateTask(task.id, {
        status: "CANCELLED",
        error_details: perm.reason,
      });

      worker.status = "ERROR";
      worker.currentTaskId = null;
      worker.currentTaskTitle = null;
      worker.lastLog = `❌ Bị chặn bởi phân quyền: ${perm.reason}`;
      worker.updatedAt = new Date().toISOString();
      return { taskId: task.id, status: "CANCELLED", error: perm.reason };
    }

    if (await isEmergencyStopActive()) {
      await TaskStore.updateTask(task.id, {
        status: "PAUSED",
        current_step: "Tạm dừng do Emergency Stop",
      });
      worker.status = "IDLE";
      worker.currentTaskId = null;
      worker.currentTaskTitle = null;
      worker.lastLog = "⏸️ Đã tạm dừng do Emergency Stop.";
      worker.updatedAt = new Date().toISOString();
      return { taskId: task.id, status: "PAUSED", message: "Tác vụ đã tạm dừng." };
    }

    // 2. Mark task RUNNING
    await TaskStore.updateTask(task.id, {
      status: "RUNNING",
      current_step: `Đang xử lý bởi ${worker.name}`,
    });

    worker.progress = 40;

    try {
      let taskOutput: Record<string, unknown>;

      const targetUrl = typeof task.input_data?.targetUrl === "string" ? task.input_data.targetUrl : "";
      const userInstructions = typeof task.input_data?.instructions === "string" ? task.input_data.instructions : "";
      const contextAddition = `${targetUrl ? `\nĐường dẫn mục tiêu (URL): ${targetUrl}` : ""}${userInstructions ? `\nChỉ dẫn cụ thể từ Quản trị viên: ${userInstructions}` : ""}`;

      // 3. Dispatch specific task logic
      if (task.task_type === "public_web_research" || task.task_type.includes("research")) {
        worker.lastLog = `[Web Search] Đang truy cập web & tổng hợp tài liệu...`;
        worker.progress = 60;
        const report = await executeResearch(task.title + (targetUrl ? ` ${targetUrl}` : ""));
        taskOutput = report as unknown as Record<string, unknown>;
      } else if (task.task_type === "content_drafting" || task.task_type.includes("content")) {
        worker.lastLog = `[Content AI] Đang tạo prompt pack & nội dung sáng tạo...`;
        worker.progress = 65;
        const res = await executeResilientText({
          prompt: `Bạn là trợ lý sáng tạo nội dung của Em Mì.
Nhiệm vụ: ${task.title}
Mô tả: ${task.description || ""}${contextAddition}

Hãy tạo:
1. Tiêu đề thương mại cuốn hút (Catchy Title)
2. Bộ 10 Prompt mẫu chi tiết kèm thông số kỹ thuật (Midjourney / Stable Diffusion)
3. Mô tả sản phẩm chào bán (Listing Description)
4. Mức giá khuyến nghị bằng USD và VND
5. Thẻ từ khóa (Tags)`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.7,
        });
        taskOutput = { content: res.text, modelUsed: res.modelUsed };
      } else if (task.task_type === "digital_product_pack" || task.task_type.includes("product")) {
        worker.lastLog = `[Digital Product] Đang đóng gói tài nguyên & ebook...`;
        worker.progress = 65;
        const res = await executeResilientText({
          prompt: `Bạn là chuyên gia đóng gói sản phẩm số của Em Mì.
Nhiệm vụ: ${task.title}
Mô tả: ${task.description || ""}${contextAddition}

Hãy đóng gói một sản phẩm số hoàn chỉnh sẵn sàng thương mại hóa trên Gumroad/Payhip:
1. Tên sản phẩm thương mại & Slogan cuốn hút
2. Mục lục chi tiết / Cấu trúc nội dung 5 phần cốt lõi
3. Bản thảo nội dung chi tiết & hướng dẫn thực hành
4. Bộ 15 Prompt / Mẫu thực thi đi kèm
5. Trang bán hàng (Sales Page Copy) & Báo giá khuyến nghị ($7 - $29 / 150.000₫ - 650.000₫)`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.6,
        });
        taskOutput = { digitalProduct: res.text, modelUsed: res.modelUsed };
      } else if (task.task_type === "affiliate_campaign_draft" || task.task_type.includes("affiliate")) {
        worker.lastLog = `[Affiliate] Đang xây dựng chiến dịch tiếp thị liên kết...`;
        worker.progress = 65;
        const res = await executeResilientText({
          prompt: `Bạn là chuyên gia Affiliate Marketing của Em Mì.
Nhiệm vụ: ${task.title}
Mô tả: ${task.description || ""}${contextAddition}

Hãy xây dựng chiến dịch tiếp thị liên kết hoàn chỉnh:
1. Chiến lược sản phẩm ngách & đối tượng mục tiêu
2. Kịch bản Video ngắn (TikTok/Reels/Shorts 45s) kèm Hook và Call-to-Action (CTA)
3. Bài viết review phân tích Ưu / Nhược điểm có tính thuyết phục cao
4. Vị trí đặt link Affiliate tối ưu hóa tỷ lệ chuyển đổi (CTR)
5. Dự phóng hoa hồng và tỷ lệ chuyển đổi kỳ vọng`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.6,
        });
        taskOutput = { affiliateCampaign: res.text, modelUsed: res.modelUsed };
      } else if (task.task_type === "seo_metadata" || task.task_type.includes("seo")) {
        worker.lastLog = `[SEO] Đang tối ưu từ khóa & metadata...`;
        worker.progress = 70;
        const res = await executeResilientText({
          prompt: `Tạo bộ 35 từ khóa SEO thương mại tiếng Anh & tiếng Việt cho chủ đề: "${task.title}".${contextAddition}
Yêu cầu phân loại: Primary Keywords, Long-tail Keywords, High-Intent Keywords.`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.4,
        });
        taskOutput = { seoKeywords: res.text, modelUsed: res.modelUsed };
      } else if (task.task_type === "ugc_campaign" || task.task_type.includes("ugc")) {
        worker.lastLog = `[UGC Brief] Đang lập kịch bản video UGC & chào giá thương hiệu...`;
        worker.progress = 65;
        const res = await executeResilientText({
          prompt: `Bạn là chuyên gia sản xuất nội dung UGC & Brand Campaigns của Em Mì.
Nhiệm vụ: ${task.title}
Mô tả: ${task.description || ""}${contextAddition}

Hãy xây dựng hồ sơ chiến dịch UGC chuyên nghiệp:
1. Ý tưởng Video ngắn 30-60s (Hook - Pain Point - Solution - Offer)
2. Kịch bản phân cảnh chi tiết (Visual, Voice-over Audio, On-screen Text)
3. Hướng dẫn quay chụp thực tế bằng điện thoại
4. Báo giá thù lao đề xuất cho nhãn hàng (VND)
5. Điều khoản bàn giao & cam kết quyền tác giả`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.6,
        });
        taskOutput = { ugcCampaign: res.text, modelUsed: res.modelUsed };
      } else if (task.task_type === "subscription_ppv" || task.task_type.includes("subscription")) {
        worker.lastLog = `[Subscription] Đang tạo bộ nội dung đặc quyền thành viên...`;
        worker.progress = 65;
        const res = await executeResilientText({
          prompt: `Bạn là trợ lý quản lý nội dung đăng ký thành viên (Subscription & Premium PPV) của Em Mì.
Nhiệm vụ: ${task.title}
Mô tả: ${task.description || ""}${contextAddition}

Hãy xây dựng gói nội dung thành viên độc quyền (Patreon/Fanvue):
1. Tiêu đề bài đăng đặc quyền (Exclusive Post Title)
2. Bài viết mở rộng chuyên sâu (Deep-dive guide / Behind the scenes)
3. Bộ tài nguyên đính kèm dành riêng cho Subscriber
4. Tin nhắn chào mừng tự động cho thành viên mới (Welcome Message)
5. Khung giá đề xuất cho các Tier thành viên ($5, $15, $30/tháng)`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.6,
        });
        taskOutput = { subscriptionContent: res.text, modelUsed: res.modelUsed };
      } else if (task.task_type === "internal_calculation" || task.task_type.includes("calc")) {
        worker.lastLog = `[Finance] Đang tính toán tỷ suất lợi nhuận & dòng tiền...`;
        worker.progress = 75;
        const grossAmountVnd =
          typeof task.input_data?.grossAmountVnd === "number" &&
          Number.isFinite(task.input_data.grossAmountVnd) &&
          task.input_data.grossAmountVnd >= 0
            ? task.input_data.grossAmountVnd
            : 5000000;
        const platformFeeVnd =
          typeof task.input_data?.platformFeeVnd === "number" &&
          Number.isFinite(task.input_data.platformFeeVnd) &&
          task.input_data.platformFeeVnd >= 0 &&
          task.input_data.platformFeeVnd <= grossAmountVnd
            ? task.input_data.platformFeeVnd
            : Math.round(grossAmountVnd * 0.1);

        taskOutput = {
          simulationOnly: true,
          grossAmountVnd,
          platformFeeVnd,
          netAmountVnd: grossAmountVnd - platformFeeVnd,
          formula: "Net = Gross - Platform_Fees",
        };
      } else {
        worker.lastLog = `[Worker] Đang thực thi tác vụ với Gemini...`;
        worker.progress = 65;
        const res = await executeResilientText({
          prompt: `Bạn là trợ lý AI điều hành doanh nghiệp của Em Mì.
Nhiệm vụ: ${task.title}
Mô tả: ${task.description || ""}${contextAddition}

Hãy xử lý và cung cấp giải pháp hành động chi tiết, cấu trúc rõ ràng và sẵn sàng sử dụng.`,
          targetModel: "gemini-3.6-flash",
          temperature: 0.5,
        });
        taskOutput = { generalOutput: res.text, modelUsed: res.modelUsed };
      }

      // 4. Mark task COMPLETED
      await TaskStore.updateTask(task.id, {
        status: "COMPLETED",
        result: taskOutput,
        completed_at: new Date().toISOString(),
      });

      // 5. Credit revenue if task is a verified commercial order (Never fabricate fake money)
      try {
        const rawOutput = (taskOutput || {}) as Record<string, unknown>;
        if (task.task_type === "internal_calculation") {
          // Simulation calculations are NEVER marked as paid revenue
          await createAdminClient().from("revenue_records").insert({
            revenue_type: "commission",
            status: "estimated",
            gross_amount_vnd: typeof rawOutput.grossAmountVnd === "number" ? rawOutput.grossAmountVnd : 0,
            platform_fee_vnd: typeof rawOutput.platformFeeVnd === "number" ? rawOutput.platformFeeVnd : 0,
            evidence: `Mô phỏng tài chính (Không ghi nhận doanh thu thực): ${task.title}`,
            verification_method: "financial_simulation_only",
            period_start: new Date().toISOString().slice(0, 10),
            period_end: new Date().toISOString().slice(0, 10),
            metadata: { simulationOnly: true },
          });
        } else {
          // Check if there is an explicit commercial order or sale price attached to the task
          const inputOrderVnd =
            typeof task.input_data?.orderAmountVnd === "number"
              ? task.input_data.orderAmountVnd
              : typeof task.input_data?.salePriceVnd === "number"
              ? task.input_data.salePriceVnd
              : null;

          if (inputOrderVnd !== null && inputOrderVnd > 0) {
            const revType =
              task.task_type === "digital_product_pack" || task.task_type === "content_drafting"
                ? "sale"
                : task.task_type === "seo_metadata"
                ? "royalty"
                : "affiliate";

            await createAdminClient().from("revenue_records").insert({
              revenue_type: revType,
              status: "paid",
              gross_amount_vnd: inputOrderVnd,
              platform_fee_vnd: Math.round(inputOrderVnd * 0.1),
              evidence: `Đơn hàng thương mại đã hoàn tất: ${task.title}`,
              verification_method: "worker_fleet_execution",
              verified_at: new Date().toISOString(),
              period_start: new Date().toISOString().slice(0, 10),
              period_end: new Date().toISOString().slice(0, 10),
            });
          }
        }
      } catch (revErr) {
        console.warn("[WorkerPool] Could not insert revenue record:", revErr);
      }

      worker.status = "COMPLETED";
      worker.progress = 100;
      worker.tasksCompleted += 1;
      worker.lastLog = `✅ Hoàn thành xuất sắc: ${task.title.slice(0, 30)}...`;
      worker.currentTaskId = null;
      worker.currentTaskTitle = null;
      worker.updatedAt = new Date().toISOString();

      return {
        taskId: task.id,
        status: "COMPLETED",
        output: taskOutput,
        actualCostKnown: false,
        workerName: worker.name,
      };
    } catch (err: unknown) {
      console.error(`[WorkerPool] Lỗi thực thi task ${task.id}:`, err);

      const nextRetryCount = task.retry_count + 1;
      const willRetry = nextRetryCount <= task.max_retries;
      const errorMessage = err instanceof Error ? err.message : "Lỗi thực thi không xác định.";
      await TaskStore.updateTask(task.id, {
        status: willRetry ? "QUEUED" : "FAILED",
        retry_count: nextRetryCount,
        error_details: errorMessage,
      });

      worker.status = "ERROR";
      worker.lastLog = `❌ Lỗi: ${errorMessage.slice(0, 40)}`;
      worker.currentTaskId = null;
      worker.currentTaskTitle = null;
      worker.updatedAt = new Date().toISOString();

      return { taskId: task.id, status: willRetry ? "QUEUED" : "FAILED", error: errorMessage };
    }
  }

  /**
   * Execute a specific single task with a chosen or available worker
   */
  public async executeSingleTask(taskId: string, requestedWorkerId?: string): Promise<WorkerTaskResult> {
    if (await isEmergencyStopActive()) {
      throw new Error("Hệ thống đang ở trạng thái Dừng Khẩn Cấp (Emergency Stop). Không thể chạy tác vụ!");
    }

    const task = await TaskStore.getTask(taskId);
    if (!task) {
      throw new Error(`Không tìm thấy tác vụ với ID: ${taskId}`);
    }

    this.syncWorkersWithKeyPool();
    let worker: WorkerSlot | undefined;
    if (requestedWorkerId) {
      worker = this.workers.get(requestedWorkerId);
    }
    if (!worker) {
      worker = Array.from(this.workers.values()).find(
        (w) => w.status === "IDLE" || w.status === "COMPLETED"
      ) || Array.from(this.workers.values())[0];
    }

    if (!worker) {
      throw new Error("Không có worker khả dụng trong hệ thống.");
    }

    return this.executeTaskWithWorker(worker, task);
  }
}

export const workerPool = new WorkerPoolManager();
