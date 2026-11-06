import { TaskPlannerAgent, BrowserExecutionAgent, VerificationAgent, SupervisorAgent, PlannedSubtask } from "./agents";
import { TaskStore } from "@/features/agent/task-store";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VerificationResult, BrowserEventType } from "./types";

export interface MasterDispatchOptions {
  goal: string;
  targetUrl: string;
  concurrency?: number;
  allowLocalTest?: boolean;
  onEvent?: (eventType: BrowserEventType, details?: Record<string, unknown>) => void;
}

export interface MasterDispatchSummary {
  masterTaskId: string;
  goal: string;
  targetUrl: string;
  totalSubtasks: number;
  completedSubtasks: number;
  failedSubtasks: number;
  waitingHumanReview: number;
  verifications: Array<{
    subtaskId: string;
    title: string;
    outcome: VerificationResult["outcome"];
    notes: string;
    evidenceScreenshot?: string;
    base64Thumbnail?: string;
  }>;
}

export class MasterOrchestrator {
  /**
   * End-to-end multi-agent orchestration for real browser execution
   */
  static async dispatchBrowserTask(options: MasterDispatchOptions): Promise<MasterDispatchSummary> {
    SupervisorAgent.initializeFleet();
    const concurrency = Math.min(Math.max(options.concurrency || 2, 1), 4);
    const masterTaskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    options.onEvent?.("BOT_STARTED", {
      orchestrator: "Master Orchestrator",
      goal: options.goal,
      targetUrl: options.targetUrl,
      concurrency,
    });

    // 1. Task Planner decomposes goal into structured subtasks
    const subtasks = TaskPlannerAgent.planBrowserTask(options.goal, options.targetUrl);

    const summary: MasterDispatchSummary = {
      masterTaskId,
      goal: options.goal,
      targetUrl: options.targetUrl,
      totalSubtasks: subtasks.length,
      completedSubtasks: 0,
      failedSubtasks: 0,
      waitingHumanReview: 0,
      verifications: [],
    };

    // 2. Register master task into TaskStore for durable persistence
    await TaskStore.addTask({
      title: options.goal,
      task_type: "public_web_research",
      description: `Điều phối tự động trình duyệt web cho: ${options.targetUrl}`,
      priority: 95,
      status: "RUNNING",
      input_data: {
        targetUrl: options.targetUrl,
        concurrency,
        subtasksTotal: subtasks.length,
      },
    });

    // 3. Process subtasks with concurrency pool
    const availableWorkers = ["bot_browser_1", "bot_browser_2", "bot_browser_3", "bot_browser_4"].slice(0, concurrency);

    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      const assignedBotId = availableWorkers[i % availableWorkers.length];

      SupervisorAgent.setBotBusy(assignedBotId, subtask.id);
      options.onEvent?.("TASK_ASSIGNED", { subtaskId: subtask.id, botId: assignedBotId, title: subtask.title });

      // Real Browser Agent Execution
      const executionReport = await BrowserExecutionAgent.executeSubtask(subtask, assignedBotId, {
        allowLocalTest: options.allowLocalTest,
        onEventCallback: options.onEvent,
      });

      // Verification Agent Evaluation
      const verification = VerificationAgent.verifyExecution(executionReport, subtask.expectedAssertion);

      if (verification.outcome === "VERIFIED_SUCCESS") {
        summary.completedSubtasks += 1;
        SupervisorAgent.setBotIdle(assignedBotId, true);
        options.onEvent?.("VERIFIED_SUCCESS", {
          subtaskId: subtask.id,
          confidence: verification.confidenceScore,
          notes: verification.notes,
        });
      } else if (verification.outcome === "NEEDS_HUMAN_REVIEW") {
        summary.waitingHumanReview += 1;
        SupervisorAgent.setBotIdle(assignedBotId, false);
        options.onEvent?.("HUMAN_REVIEW_REQUIRED", {
          subtaskId: subtask.id,
          reason: verification.notes,
        });

        // Record into human_approvals in database
        try {
          const supabase = createAdminClient();
          await supabase.from("human_approvals").insert({
            task_id: crypto.randomUUID(),
            execution_id: crypto.randomUUID(),
            checkpoint_type: "CAPTCHA",
            reason: verification.notes,
            status: "PENDING",
            page_url: options.targetUrl,
            screenshot_preview: executionReport.evidence?.filePath,
          });
        } catch (dbErr) {
          console.warn("[MasterOrchestrator] Human approval DB sync warning:", dbErr);
        }
      } else {
        summary.failedSubtasks += 1;
        SupervisorAgent.setBotIdle(assignedBotId, false);
        options.onEvent?.("VERIFIED_FAILURE", {
          subtaskId: subtask.id,
          notes: verification.notes,
        });
      }

      summary.verifications.push({
        subtaskId: subtask.id,
        title: subtask.title,
        outcome: verification.outcome,
        notes: verification.notes,
        evidenceScreenshot: executionReport.evidence?.filePath,
        base64Thumbnail: executionReport.evidence?.base64Thumbnail,
      });
    }

    return summary;
  }
}

