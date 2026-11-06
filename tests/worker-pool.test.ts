import { describe, it, expect, beforeEach } from "vitest";
import { workerPool } from "@/features/agent/worker-pool";
import { TaskStore } from "@/features/agent/task-store";
import { keyManager } from "@/lib/ai/key-manager";

describe("Multi-Account Parallel Worker Fleet", () => {
  beforeEach(() => {
    process.env.AI_API_KEYS = "key_worker_alpha,key_worker_beta,key_worker_gamma";
    keyManager.refreshKeys();
    workerPool.syncWorkersWithKeyPool();
  });

  it("should initialize workers based on the number of accounts in the pool", () => {
    const fleet = workerPool.getFleetStatus();
    expect(fleet.totalWorkers).toBe(3);
    expect(fleet.workers[0].name).toContain("Trợ Lý Chuyên Trách #1");
    expect(fleet.workers[1].name).toContain("Trợ Lý Chuyên Trách #2");
    expect(fleet.workers[2].name).toContain("Trợ Lý Chuyên Trách #3");
  });

  it("should correctly queue and retrieve tasks from TaskStore", async () => {
    const task = await TaskStore.addTask({
      title: "Test Task for Parallel Dispatch",
      task_type: "internal_calculation",
      priority: 95,
    });

    expect(task.id).toBeDefined();
    expect(task.status).toBe("PENDING");

    const pending = await TaskStore.getPendingTasks(5);
    expect(pending.some((t) => t.id === task.id)).toBe(true);
  });

  it("should atomically claim pending tasks once", async () => {
    const task = await TaskStore.addTask({
      title: "Test Task for Atomic Claim",
      task_type: "internal_calculation",
      priority: 1_000,
    });

    const claimed = await TaskStore.claimPendingTasks(1);
    expect(claimed[0]?.id).toBe(task.id);
    expect(claimed[0]?.status).toBe("RUNNING");
    expect(await TaskStore.claimPendingTasks(1)).not.toContainEqual(
      expect.objectContaining({ id: task.id })
    );
  });

  it("binds task approvals to a separate approver and unchanged payload", async () => {
    const task = await TaskStore.addTask({
      title: "Approval-bound external communication",
      task_type: "external_communication_new",
      status: "RUNNING",
      priority: 10_000,
      created_by: "11111111-1111-4111-a111-111111111111",
      approval_status: "pending",
    });

    await TaskStore.requestTaskApproval(task.id);
    await TaskStore.updateTask(task.id, { title: "Changed before approval" });
    expect(await TaskStore.approveTask(task.id, "22222222-2222-4222-a222-222222222222")).toBe(false);

    await TaskStore.requestTaskApproval(task.id);
    expect(await TaskStore.approveTask(task.id, task.created_by!)).toBe(false);
    expect(await TaskStore.approveTask(task.id, "22222222-2222-4222-a222-222222222222")).toBe(true);

    const [claimed] = await TaskStore.claimPendingTasks(1);
    expect(claimed.id).toBe(task.id);
    expect(await TaskStore.isTaskApprovalValid(claimed)).toBe(true);

    const changed = await TaskStore.updateTask(task.id, { title: "Changed after approval" });
    expect(changed).not.toBeNull();
    expect(await TaskStore.isTaskApprovalValid(changed!)).toBe(false);
  });

  it("rejects expired task approvals", async () => {
    const task = await TaskStore.addTask({
      title: "Expired approval",
      task_type: "external_communication_new",
      status: "RUNNING",
      priority: 10_001,
      created_by: "33333333-3333-4333-a333-333333333333",
      approval_status: "pending",
    });

    await TaskStore.requestTaskApproval(task.id);
    await TaskStore.updateTask(task.id, {
      approval_expires_at: new Date(Date.now() - 1_000).toISOString(),
    });

    expect(await TaskStore.approveTask(task.id, "44444444-4444-4444-a444-444444444444")).toBe(false);
  });

  it("should update task status to COMPLETED after worker execution", async () => {
    const task = await TaskStore.addTask({
      title: "Tính toán tài chính nhanh",
      task_type: "internal_calculation",
      priority: 99,
      input_data: { grossAmountVnd: 1_000_000, platformFeeVnd: 100_000 },
    });

    const fleet = workerPool.getFleetStatus();
    const worker = fleet.workers[0];

    const result = await workerPool.executeTaskWithWorker(worker, task);

    expect(result.status).toBe("COMPLETED");
    expect(result.output).toBeDefined();

    const allTasks = await TaskStore.getAllTasks();
    const completedTask = allTasks.find((t) => t.id === task.id);
    expect(completedTask?.status).toBe("COMPLETED");
  });
});
