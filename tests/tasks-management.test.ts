import { describe, it, expect, beforeEach } from "vitest";
import { TaskStore } from "@/features/agent/task-store";
import { workerPool } from "@/features/agent/worker-pool";
import { keyManager } from "@/lib/ai/key-manager";

describe("Task Progress, Management & Worker Assignment", () => {
  beforeEach(() => {
    process.env.AI_API_KEYS = "key_worker_alpha,key_worker_beta";
    keyManager.refreshKeys();
    workerPool.syncWorkersWithKeyPool();
  });

  it("creates a task with assigned bot and progress", async () => {
    const task = await TaskStore.addTask({
      title: "Khảo sát ToS Prime Opinion và kiểm tra payout PayPal",
      task_type: "taskmoney_tos_analysis",
      description: "Phân tích điều khoản chống bot, kiểm tra ngưỡng rút $5",
      priority: 90,
      assigned_worker: "taskmoney-researcher",
      assigned_worker_name: "Trinh Sát (Researcher)",
      progress: 0,
    });

    expect(task.id).toBeDefined();
    expect(task.title).toContain("Prime Opinion");
    expect(task.assigned_worker).toBe("taskmoney-researcher");
    expect(task.assigned_worker_name).toBe("Trinh Sát (Researcher)");
    expect(task.progress).toBe(0);

    const fetched = await TaskStore.getTask(task.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.assigned_worker).toBe("taskmoney-researcher");
  });

  it("reassigns a task to another bot", async () => {
    const task = await TaskStore.addTask({
      title: "Gán nhãn dữ liệu hình ảnh Toloka AI",
      task_type: "ai_data_labeling",
      priority: 75,
      assigned_worker: "taskmoney-executor",
      assigned_worker_name: "Thực Thi (Executor)",
    });

    const updated = await TaskStore.assignTask(
      task.id,
      "taskmoney-verifier",
      "Giám Sát (Verifier)"
    );

    expect(updated).not.toBeNull();
    expect(updated?.assigned_worker).toBe("taskmoney-verifier");
    expect(updated?.assigned_worker_name).toBe("Giám Sát (Verifier)");

    const reFetched = await TaskStore.getTask(task.id);
    expect(reFetched?.assigned_worker).toBe("taskmoney-verifier");
  });

  it("updates task progress and step description", async () => {
    const task = await TaskStore.addTask({
      title: "Thực hiện vi nhiệm vụ SproutGigs",
      task_type: "microtask_execution",
      priority: 80,
      progress: 10,
    });

    const updated = await TaskStore.updateTaskProgress(task.id, 65, "Đang kiểm tra bằng chứng hoàn thành...");
    expect(updated?.progress).toBe(65);
    expect(updated?.current_step).toContain("Đang kiểm tra bằng chứng");

    // Clamps between 0 and 100
    const clampedMax = await TaskStore.updateTaskProgress(task.id, 150);
    expect(clampedMax?.progress).toBe(100);

    const clampedMin = await TaskStore.updateTaskProgress(task.id, -20);
    expect(clampedMin?.progress).toBe(0);
  });

  it("deletes a task permanently", async () => {
    const task = await TaskStore.addTask({
      title: "Tác vụ rác cần xóa bỏ",
      task_type: "temporary_test",
      priority: 10,
    });

    expect(await TaskStore.getTask(task.id)).not.toBeNull();

    const deleteOk = await TaskStore.deleteTask(task.id);
    expect(deleteOk).toBe(true);

    const afterDelete = await TaskStore.getTask(task.id);
    expect(afterDelete).toBeNull();
  });

  it("executes a single assigned task on-demand", async () => {
    const task = await TaskStore.addTask({
      title: "Tính toán chi phí & lợi nhuận sàn Freecash",
      task_type: "internal_calculation",
      priority: 95,
      assigned_worker: "taskmoney-finance",
      assigned_worker_name: "Thủ Quỹ (Finance)",
      input_data: { grossAmountVnd: 500_000, platformFeeVnd: 25_000 },
    });

    const res = await workerPool.executeSingleTask(task.id);
    expect(res.taskId).toBe(task.id);
    expect(res.status).toBe("COMPLETED");

    const finishedTask = await TaskStore.getTask(task.id);
    expect(finishedTask?.status).toBe("COMPLETED");
    expect(finishedTask?.result).toBeDefined();
  });
});

