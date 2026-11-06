import "server-only";
import { TaskExecution, TaskMoneyTask, BrowserActionLog } from "./types";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ExecutionContext {
  task: TaskMoneyTask;
  workerName?: string;
  simulateBarrier?: "NONE" | "CAPTCHA" | "PHONE_OTP";
}

export class TaskMoneyExecutor {
  /**
   * Execute task steps with strict browser logging and human-in-the-loop triggers
   */
  static async executeTask(ctx: ExecutionContext): Promise<{
    execution: TaskExecution;
    actionLogs: BrowserActionLog[];
    needsHumanIntervention: boolean;
  }> {
    const executionId = crypto.randomUUID();
    const actionLogs: BrowserActionLog[] = [];
    const now = new Date().toISOString();

    const execution: TaskExecution = {
      id: executionId,
      taskId: ctx.task.id,
      workerName: ctx.workerName || "taskmoney-executor-alpha",
      status: "RUNNING",
      actualRewardEarned: 0,
      browserSessionId: `session_${Date.now()}`,
      startedAt: now,
    };

    // Step 1: Navigate to task URL
    actionLogs.push({
      executionId,
      actionType: "navigate",
      targetSelector: "window.location",
      actionDetails: { url: ctx.task.taskUrl },
      status: "success",
      createdAt: new Date().toISOString(),
    });

    // Step 2: Check for Anti-Bot / Human barrier
    if (ctx.simulateBarrier === "CAPTCHA") {
      actionLogs.push({
        executionId,
        actionType: "checkpoint_detected",
        targetSelector: "iframe[src*='turnstile'], iframe[src*='recaptcha']",
        actionDetails: { checkpoint: "Cloudflare Turnstile Challenge Detected" },
        status: "blocked_captcha",
        createdAt: new Date().toISOString(),
      });

      execution.status = "WAITING_HUMAN";
      execution.humanInterventionReason = "Phát hiện Captcha bảo vệ nâng cao (Turnstile/hCaptcha). Hệ thống đã dừng lại để Người dùng trực tiếp giải.";
      
      await this.persistLogs(execution, actionLogs);
      return { execution, actionLogs, needsHumanIntervention: true };
    }

    if (ctx.simulateBarrier === "PHONE_OTP") {
      actionLogs.push({
        executionId,
        actionType: "checkpoint_detected",
        targetSelector: "input[name='otp_code']",
        actionDetails: { checkpoint: "SMS / Phone OTP verification required" },
        status: "blocked_captcha",
        createdAt: new Date().toISOString(),
      });

      execution.status = "WAITING_HUMAN";
      execution.humanInterventionReason = "Yêu cầu mã xác thực SMS/Điện thoại. Đã tạm dừng chờ Người dùng cung cấp OTP.";
      
      await this.persistLogs(execution, actionLogs);
      return { execution, actionLogs, needsHumanIntervention: true };
    }

    // Step 3: Normal execution flow with jitter
    actionLogs.push({
      executionId,
      actionType: "click",
      targetSelector: "button.submit-task",
      actionDetails: { delayMs: 1850 },
      status: "success",
      createdAt: new Date().toISOString(),
    });

    execution.status = "COMPLETED";
    execution.actualRewardEarned = ctx.task.expectedRewardVnd;
    execution.completedAt = new Date().toISOString();

    await this.persistLogs(execution, actionLogs);
    return { execution, actionLogs, needsHumanIntervention: false };
  }

  private static async persistLogs(execution: TaskExecution, logs: BrowserActionLog[]): Promise<void> {
    try {
      const supabase = createAdminClient();
      await supabase.from("taskmoney_executions").insert({
        id: execution.id,
        task_id: execution.taskId,
        worker_name: execution.workerName,
        status: execution.status,
        actual_reward_earned: execution.actualRewardEarned,
        browser_session_id: execution.browserSessionId,
        human_intervention_reason: execution.humanInterventionReason,
        started_at: execution.startedAt,
        completed_at: execution.completedAt,
      });

      if (logs.length > 0) {
        await supabase.from("taskmoney_browser_logs").insert(
          logs.map((l) => ({
            execution_id: l.executionId,
            action_type: l.actionType,
            target_selector: l.targetSelector,
            action_details: l.actionDetails,
            status: l.status,
          }))
        );
      }
    } catch (err) {
      console.warn("[TaskMoneyExecutor] Log persistence fallback:", err);
    }
  }
}

