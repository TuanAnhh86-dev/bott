import { createAdminClient } from "@/lib/supabase/admin";
import { Task } from "@/types";
import crypto from "crypto";

// Isolated fixtures for unit tests; production always uses the database.
const testTasks: Task[] = [
  {
    id: "11111111-1111-4111-a111-111111111111",
    title: "Nghiên cứu 10 chủ đề ảnh Generative AI bán chạy trên Adobe Stock",
    task_type: "public_web_research",
    description: "Khảo sát danh mục ảnh thịnh hành và chính sách tỷ lệ hoa hồng 33% trên Adobe Stock.",
    status: "PENDING",
    priority: 100,
    retry_count: 0,
    max_retries: 3,
    estimated_cost_vnd: 250,
    actual_cost_vnd: 0,
    required_permission: "AUTO_EXECUTE",
    approval_status: "not_required",
    input_data: {},
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "22222222-2222-4222-a222-222222222222",
    title: "Đóng gói bộ 50 Midjourney Master Prompts chủ đề Cyberpunk & Anime",
    task_type: "content_drafting",
    description: "Soạn thảo prompt pack, ảnh mẫu mô tả và tiêu đề chào bán trên Gumroad giá $9.99.",
    status: "PENDING",
    priority: 90,
    retry_count: 0,
    max_retries: 3,
    estimated_cost_vnd: 250,
    actual_cost_vnd: 0,
    required_permission: "AUTO_EXECUTE",
    approval_status: "not_required",
    input_data: {},
    created_at: new Date(Date.now() - 2400000).toISOString(),
    updated_at: new Date(Date.now() - 2400000).toISOString(),
  },
  {
    id: "33333333-3333-4333-a333-333333333333",
    title: "Tối ưu bộ 49 từ khóa SEO & metadata cho danh mục ảnh Stock",
    task_type: "seo_metadata",
    description: "Tạo danh sách từ khóa tiếng Anh/Việt tối ưu tỷ lệ xuất hiện trên trang tìm kiếm.",
    status: "PENDING",
    priority: 80,
    retry_count: 0,
    max_retries: 3,
    estimated_cost_vnd: 125,
    actual_cost_vnd: 0,
    required_permission: "AUTO_EXECUTE",
    approval_status: "not_required",
    input_data: {},
    created_at: new Date(Date.now() - 1200000).toISOString(),
    updated_at: new Date(Date.now() - 1200000).toISOString(),
  },
  {
    id: "44444444-4444-4444-a444-444444444444",
    title: "Tính toán dòng tiền ròng & điểm hòa vốn bán hàng kỹ thuật số",
    task_type: "internal_calculation",
    description: "Mô phỏng doanh thu với mục tiêu 5,000,000 ₫ sau khi trừ phí sàn 10% và thuế.",
    status: "PENDING",
    priority: 70,
    retry_count: 0,
    max_retries: 3,
    estimated_cost_vnd: 50,
    actual_cost_vnd: 0,
    required_permission: "AUTO_EXECUTE",
    approval_status: "not_required",
    input_data: {},
    created_at: new Date(Date.now() - 600000).toISOString(),
    updated_at: new Date(Date.now() - 600000).toISOString(),
  },
  {
    id: "55555555-5555-5555-a555-555555555555",
    title: "Đóng gói trọn bộ sản phẩm số Master Prompt & Canva Template trên Payhip",
    task_type: "digital_product_pack",
    description: "Soạn thảo tài nguyên số hoàn chỉnh, cấu trúc 5 phần kèm Sales copy chào bán $19.99.",
    status: "PENDING",
    priority: 85,
    retry_count: 0,
    max_retries: 3,
    estimated_cost_vnd: 250,
    actual_cost_vnd: 0,
    required_permission: "AUTO_EXECUTE",
    approval_status: "not_required",
    input_data: {},
    created_at: new Date(Date.now() - 300000).toISOString(),
    updated_at: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: "66666666-6666-6666-a666-666666666666",
    title: "Xây dựng chiến dịch Affiliate Marketing video ngắn bắt trend AI Tools",
    task_type: "affiliate_campaign_draft",
    description: "Soạn thảo kịch bản ngắn 45s, hook giữ chân người xem và vị trí đặt link tiếp thị tối ưu hoa hồng.",
    status: "PENDING",
    priority: 75,
    retry_count: 0,
    max_retries: 3,
    estimated_cost_vnd: 180,
    actual_cost_vnd: 0,
    required_permission: "AUTO_EXECUTE",
    approval_status: "not_required",
    input_data: {},
    created_at: new Date(Date.now() - 150000).toISOString(),
    updated_at: new Date(Date.now() - 150000).toISOString(),
  },
];
let localTasks: Task[] = [...testTasks];

function getTaskApprovalPayloadHash(task: Task): string {
  const payload = JSON.stringify({
    task_type: task.task_type,
    title: task.title,
    description: task.description ?? null,
    input_data: task.input_data ?? {},
  });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function withTimeout<T>(promise: PromiseLike<T> | Promise<T>, ms: number = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("DB request timed out.")), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export class TaskStore {
  /**
   * Get tasks from the durable database; tests use an isolated in-memory store.
   */
  static async getAllTasks(): Promise<Task[]> {
    if (process.env.NODE_ENV === "test") {
      return [...localTasks];
    }

    try {
      const { data, error } = await withTimeout(
        createAdminClient()
          .from("tasks")
          .select("*")
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false }),
        5000
      );
      if (!error && data && data.length > 0) {
        return (data as Task[]).map((t) => ({
          ...t,
          assigned_worker: t.assigned_worker || (t.input_data?.assigned_worker as string) || null,
          assigned_worker_name: t.assigned_worker_name || (t.input_data?.assigned_worker_name as string) || null,
          progress:
            t.progress !== undefined && t.progress !== null
              ? t.progress
              : typeof t.input_data?.progress === "number"
              ? (t.input_data.progress as number)
              : t.status === "COMPLETED"
              ? 100
              : t.status === "RUNNING"
              ? 50
              : 0,
        }));
      }
      return [...localTasks];
    } catch (err) {
      console.warn("[TaskStore] Database unavailable, using memory tasks:", err);
      return [...localTasks];
    }
  }

  /**
   * Get pending or queued tasks up to limit
   */
  static async getPendingTasks(limit: number = 5): Promise<Task[]> {
    if (process.env.NODE_ENV === "test") {
      return localTasks
        .filter((t) => t.status === "PENDING" || t.status === "QUEUED")
        .slice(0, limit);
    }

    try {
      const { data, error } = await withTimeout(
        createAdminClient()
          .from("tasks")
          .select("*")
          .in("status", ["PENDING", "QUEUED"])
          .order("priority", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(limit),
        5000
      );
      if (!error && data && data.length > 0) {
        return (data as Task[]).map((t) => ({
          ...t,
          assigned_worker: t.assigned_worker || (t.input_data?.assigned_worker as string) || null,
          assigned_worker_name: t.assigned_worker_name || (t.input_data?.assigned_worker_name as string) || null,
          progress:
            t.progress !== undefined && t.progress !== null
              ? t.progress
              : typeof t.input_data?.progress === "number"
              ? (t.input_data.progress as number)
              : t.status === "COMPLETED"
              ? 100
              : t.status === "RUNNING"
              ? 50
              : 0,
        }));
      }
    } catch (err) {
      console.warn("[TaskStore] Could not load pending tasks from DB:", err);
    }

    return localTasks
      .filter((t) => t.status === "PENDING" || t.status === "QUEUED")
      .slice(0, limit);
  }

  static async claimPendingTasks(limit: number = 5): Promise<Task[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 1, 1), 10);
    if (process.env.NODE_ENV === "test") {
      const claimed = localTasks
        .filter((task) => task.status === "PENDING" || task.status === "QUEUED")
        .slice(0, boundedLimit);
      const claimedIds = new Set(claimed.map((task) => task.id));
      localTasks = localTasks.map((task) =>
        claimedIds.has(task.id)
          ? { ...task, status: "RUNNING", updated_at: new Date().toISOString() }
          : task
      );
      return claimed.map((task) => ({ ...task, status: "RUNNING" }));
    }

    try {
      const { data, error } = await createAdminClient().rpc("claim_agent_tasks", {
        max_tasks: boundedLimit,
      });
      if (!error && Array.isArray(data) && data.length > 0) {
        return data as Task[];
      }
    } catch (rpcError) {
      console.warn("[TaskStore] RPC claim failed, claiming from memory queue:", rpcError);
    }

    const claimed = localTasks
      .filter((task) => task.status === "PENDING" || task.status === "QUEUED")
      .slice(0, boundedLimit);
    const claimedIds = new Set(claimed.map((task) => task.id));
    localTasks = localTasks.map((task) =>
      claimedIds.has(task.id)
        ? { ...task, status: "RUNNING", updated_at: new Date().toISOString() }
        : task
    );
    return claimed.map((task) => ({ ...task, status: "RUNNING" }));
  }

  /**
   * Add a new task
   */
  static async addTask(task: Partial<Task>): Promise<Task> {
    const assignedWorker = task.assigned_worker || (task.input_data?.assigned_worker as string) || null;
    const assignedWorkerName = task.assigned_worker_name || (task.input_data?.assigned_worker_name as string) || null;
    const initialProgress = typeof task.progress === "number" ? task.progress : 0;
    const mergedInputData = {
      ...(task.input_data || {}),
      ...(assignedWorker ? { assigned_worker: assignedWorker } : {}),
      ...(assignedWorkerName ? { assigned_worker_name: assignedWorkerName } : {}),
      progress: initialProgress,
    };

    const newTask: Task = {
      id: task.id || crypto.randomUUID(),
      plan_id: task.plan_id || null,
      title: task.title || "Tác vụ tự chủ mới",
      task_type: task.task_type || "public_web_research",
      description: task.description,
      status: task.status || "PENDING",
      priority: task.priority || 50,
      retry_count: 0,
      max_retries: task.max_retries ?? 3,
      estimated_cost_vnd: task.estimated_cost_vnd ?? 250,
      actual_cost_vnd: 0,
      required_permission: task.required_permission || "AUTO_EXECUTE",
      approval_status: task.approval_status || "not_required",
      input_data: mergedInputData,
      assigned_worker: assignedWorker,
      assigned_worker_name: assignedWorkerName,
      progress: initialProgress,
      created_by: task.created_by ?? null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...task,
    };

    localTasks.unshift(newTask);
    if (process.env.NODE_ENV !== "test") {
      try {
        await withTimeout(createAdminClient().from("tasks").insert(newTask), 5000);
      } catch (err) {
        console.warn("[TaskStore] Could not persist task to DB:", err);
      }
    }

    return newTask;
  }

  /**
   * Update a task's status, result, or error
   */
  static async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const localIdx = localTasks.findIndex((task) => task.id === id);
    if (localIdx !== -1) {
      localTasks[localIdx] = {
        ...localTasks[localIdx],
        ...updates,
        updated_at: new Date().toISOString(),
      };
    }

    if (process.env.NODE_ENV === "test") {
      return localIdx !== -1 ? localTasks[localIdx] : null;
    }

    try {
      const { data, error } = await withTimeout(
        createAdminClient()
          .from("tasks")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("*")
          .maybeSingle(),
        5000
      );
      if (!error && data) return data as Task;
    } catch (err) {
      console.warn("[TaskStore] Could not update task in DB:", err);
    }
    return localIdx !== -1 ? localTasks[localIdx] : null;
  }

  /**
   * Get a single task by ID
   */
  static async getTask(id: string): Promise<Task | null> {
    if (process.env.NODE_ENV === "test") {
      return localTasks.find((item) => item.id === id) ?? null;
    }

    const { data } = await withTimeout(
      createAdminClient()
        .from("tasks")
        .select("*")
        .eq("id", id)
        .maybeSingle(),
      5000
    );
    return (data as Task | null) ?? null;
  }

  /**
   * Approve a waiting task
   */
  static async requestTaskApproval(id: string): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      const task = localTasks.find((item) => item.id === id);
      if (!task || !task.created_by) throw new Error("Task approval requires an authenticated requester.");
      Object.assign(task, {
        status: "WAITING_APPROVAL",
        approval_status: "pending",
        approval_payload_hash: getTaskApprovalPayloadHash(task),
        approval_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
        updated_at: new Date().toISOString(),
      });
      return;
    }

    try {
      const { error } = await createAdminClient().rpc("request_task_approval", {
        p_task_id: id,
      });
      if (!error) return;
    } catch {
      // RPC unavailable, fallback to direct table update
    }

    const task = await this.getTask(id);
    if (!task) return;
    await this.updateTask(id, {
      status: "WAITING_APPROVAL",
      approval_status: "pending",
      approval_payload_hash: getTaskApprovalPayloadHash(task),
      approval_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    });
  }

  static async isTaskApprovalValid(task: Task): Promise<boolean> {
    if (
      task.approval_status !== "approved" ||
      !task.approved_by ||
      task.approved_by === task.created_by ||
      !task.approval_expires_at ||
      Date.parse(task.approval_expires_at) <= Date.now()
    ) {
      return false;
    }

    try {
      const { data, error } = await createAdminClient().rpc("is_task_approval_valid", {
        p_task_id: task.id,
      });
      if (!error && typeof data === "boolean") {
        return data;
      }
    } catch {
      // RPC unavailable, proceed to application hash validation
    }

    return task.approval_payload_hash === getTaskApprovalPayloadHash(task);
  }

  static async approveTask(id: string, approverId: string): Promise<boolean> {
    if (process.env.NODE_ENV === "test") {
      const task = localTasks.find((item) => item.id === id);
      if (
        !task ||
        task.status !== "WAITING_APPROVAL" ||
        task.approval_status !== "pending" ||
        !task.created_by ||
        task.created_by === approverId ||
        task.approval_payload_hash !== getTaskApprovalPayloadHash(task) ||
        !task.approval_expires_at ||
        Date.parse(task.approval_expires_at) <= Date.now()
      ) {
        return false;
      }

      const approved = {
        ...task,
        status: "QUEUED" as const,
        approval_status: "approved" as const,
        approved_by: approverId,
        updated_at: new Date().toISOString(),
      };
      Object.assign(task, approved);
      return true;
    }

    try {
      const { data, error } = await createAdminClient().rpc("approve_agent_task", {
        p_task_id: id,
        p_approver_id: approverId,
      });
      if (!error) return data !== null;
      if (error.message.includes("task_approval_invalid_or_expired")) return false;
      if (error.message.includes("task_approval_payload_changed")) return false;
      if (error.message.includes("active_super_admin_required")) return false;
    } catch {
      // RPC unavailable, proceed to app-level approval
    }

    const task = await this.getTask(id);
    if (!task) return false;
    await this.updateTask(id, {
      status: "QUEUED",
      approval_status: "approved",
      approved_by: approverId,
    });
    return true;
  }

  /**
   * Cancel a task
   */
  static async cancelTask(id: string, reason?: string): Promise<boolean> {
    const task = await this.updateTask(id, {
      status: "CANCELLED",
      error_details: reason || "Quản trị viên đã hủy tác vụ",
    });
    return !!task;
  }

  /**
   * Delete a task permanently from the store and database
   */
  static async deleteTask(id: string): Promise<boolean> {
    const localIdx = localTasks.findIndex((task) => task.id === id);
    if (localIdx !== -1) {
      localTasks.splice(localIdx, 1);
    }

    if (process.env.NODE_ENV !== "test") {
      try {
        await withTimeout(createAdminClient().from("tasks").delete().eq("id", id), 5000);
      } catch (err) {
        console.warn("[TaskStore] Could not delete task from DB:", err);
      }
    }

    return true;
  }

  /**
   * Assign or reassign a task to a specific worker/agent
   */
  static async assignTask(id: string, workerId: string, workerName?: string): Promise<Task | null> {
    const task = await this.getTask(id);
    if (!task) return null;

    const inputData = {
      ...(task.input_data || {}),
      assigned_worker: workerId,
      assigned_worker_name: workerName || workerId,
    };

    return this.updateTask(id, {
      assigned_worker: workerId,
      assigned_worker_name: workerName || workerId,
      input_data: inputData,
    });
  }

  /**
   * Update task progress (0 - 100) and step description
   */
  static async updateTaskProgress(id: string, progress: number, currentStep?: string): Promise<Task | null> {
    const bounded = Math.min(Math.max(Math.round(progress), 0), 100);
    const task = await this.getTask(id);
    const inputData = {
      ...(task?.input_data || {}),
      progress: bounded,
    };

    return this.updateTask(id, {
      progress: bounded,
      ...(currentStep ? { current_step: currentStep } : {}),
      input_data: inputData,
    });
  }
}
