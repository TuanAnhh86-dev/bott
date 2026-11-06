import fs from "node:fs";
import path from "node:path";
import { RealBrowserSession } from "./engine";
import { validateTargetUrl } from "./ssrf-guard";
import type {
  AgentRole,
  BrowserActionStep,
  PageInspectionResult,
  ScreenshotEvidence,
  VerificationResult,
  BrowserEventType,
} from "./types";

export interface PlannedSubtask {
  id: string;
  title: string;
  targetUrl: string;
  steps: BrowserActionStep[];
  expectedAssertion: string;
  priority: number;
}

export interface ExecutionReport {
  executionId: string;
  taskId: string;
  botId: string;
  status: "VERIFYING" | "NEEDS_HUMAN_REVIEW" | "FAILED";
  finalUrl?: string;
  inspection?: PageInspectionResult;
  evidence?: ScreenshotEvidence;
  humanInterventionReason?: string;
  events: Array<{ type: BrowserEventType; details?: Record<string, unknown>; timestamp: string }>;
  durationMs: number;
  error?: string;
}

/**
 * Agent B: Task Planner
 * Analyzes high-level goals and breaks them into discrete, verifiable browser subtasks.
 */
export class TaskPlannerAgent {
  static planBrowserTask(goal: string, targetUrl: string): PlannedSubtask[] {
    const safeUrl = targetUrl.trim();
    const subtasks: PlannedSubtask[] = [];

    // Subtask 1: Initial exploration and barrier detection
    subtasks.push({
      id: `sub_${Date.now()}_1`,
      title: `Điều hướng & Khảo sát giao diện: ${safeUrl.slice(0, 45)}...`,
      targetUrl: safeUrl,
      steps: [
        { action: "navigate", timeoutMs: 30000, description: "Tải trang web mục tiêu và đợi domcontentloaded" },
        { action: "inspect_dom", description: "Đọc cấu trúc tiêu đề, biểu mẫu và phát hiện rào cản Captcha/OTP" },
        { action: "screenshot", description: "Chụp ảnh bằng chứng phiên duyệt web thực tế" },
      ],
      expectedAssertion: "Page loads with non-empty title and no blocking Captcha barrier",
      priority: 90,
    });

    // Subtask 2: Targeted extraction or survey execution if applicable
    const lower = goal.toLowerCase();
    if (lower.includes("survey") || lower.includes("khảo sát") || safeUrl.includes("earn")) {
      subtasks.push({
        id: `sub_${Date.now()}_2`,
        title: `Phân tích danh mục khảo sát khả dụng & đối soát thù lao`,
        targetUrl: safeUrl,
        steps: [
          { action: "inspect_dom", description: "Trích xuất danh sách khảo sát và lọc bài có thưởng cao" },
          { action: "screenshot", description: "Lưu lại màn hình bảng khảo sát thời điểm quét" },
        ],
        expectedAssertion: "Survey listings extracted or form controls documented",
        priority: 80,
      });
    }

    return subtasks;
  }
}

/**
 * Agent C: Browser Execution Agent
 * Drives the real Chromium instance, evaluates steps, records events, and flags barriers.
 */
export class BrowserExecutionAgent {
  static async executeSubtask(
    subtask: PlannedSubtask,
    botId: string,
    options?: {
      allowLocalTest?: boolean;
      onEventCallback?: (type: BrowserEventType, details?: Record<string, unknown>) => void;
    }
  ): Promise<ExecutionReport> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const startTime = Date.now();
    const eventLog: Array<{ type: BrowserEventType; details?: Record<string, unknown>; timestamp: string }> = [];

    const recordEvent = (type: BrowserEventType, details?: Record<string, unknown>) => {
      eventLog.push({ type, details, timestamp: new Date().toISOString() });
      options?.onEventCallback?.(type, details);
    };

    recordEvent("TASK_STARTED", { subtaskId: subtask.id, title: subtask.title });

    const session = new RealBrowserSession({
      executionId,
      botId,
      allowLocalTest: options?.allowLocalTest,
      onEvent: (type, details) => recordEvent(type, details),
    });

    let inspectionResult: PageInspectionResult | undefined;
    let screenshotEvidence: ScreenshotEvidence | undefined;

    try {
      await session.initialize();

      // Step 1: Navigate
      inspectionResult = await session.navigate(subtask.targetUrl);

      // Check for human barrier
      if (inspectionResult.hasBarrier) {
        screenshotEvidence = await session.captureEvidence("barrier_detected");
        await session.close();

        return {
          executionId,
          taskId: subtask.id,
          botId,
          status: "NEEDS_HUMAN_REVIEW",
          finalUrl: inspectionResult.finalUrl,
          inspection: inspectionResult,
          evidence: screenshotEvidence,
          humanInterventionReason: `Phát hiện chốt chặn bảo mật (${inspectionResult.barrierType || "CAPTCHA"}). Yêu cầu Quản trị viên can thiệp trực tiếp.`,
          events: eventLog,
          durationMs: Date.now() - startTime,
        };
      }

      // Step 2: Capture evidence screenshot
      screenshotEvidence = await session.captureEvidence("completion");
      await session.close();

      recordEvent("TASK_COMPLETED", {
        executionId,
        title: inspectionResult.title,
        finalUrl: inspectionResult.finalUrl,
      });

      return {
        executionId,
        taskId: subtask.id,
        botId,
        status: "VERIFYING",
        finalUrl: inspectionResult.finalUrl,
        inspection: inspectionResult,
        evidence: screenshotEvidence,
        events: eventLog,
        durationMs: Date.now() - startTime,
      };
    } catch (err: unknown) {
      await session.close();
      const errMsg = err instanceof Error ? err.message : String(err);
      recordEvent("TASK_FAILED", { error: errMsg });

      return {
        executionId,
        taskId: subtask.id,
        botId,
        status: "FAILED",
        error: errMsg,
        events: eventLog,
        durationMs: Date.now() - startTime,
      };
    }
  }
}

/**
 * Agent D: Verification Agent
 * Authoritative verification engine that rejects unsupported claims and inspects tangible evidence.
 */
export class VerificationAgent {
  static verifyExecution(report: ExecutionReport, expectedAssertion?: string): VerificationResult {
    const checkedAt = new Date().toISOString();

    if (report.status === "FAILED") {
      return {
        outcome: "VERIFIED_FAILURE",
        confidenceScore: 0,
        notes: `Thất bại trong quá trình thực thi trình duyệt: ${report.error || "Lỗi không xác định."}`,
        checkedAt,
      };
    }

    if (report.status === "NEEDS_HUMAN_REVIEW") {
      return {
        outcome: "NEEDS_HUMAN_REVIEW",
        confidenceScore: 50,
        notes: report.humanInterventionReason || "Yêu cầu người dùng giải quyết chốt chặn bảo mật.",
        evidenceId: report.evidence?.evidenceId,
        checkedAt,
      };
    }

    // Verify evidence existence
    if (!report.evidence || !report.evidence.filePath) {
      return {
        outcome: "INSUFFICIENT_EVIDENCE",
        confidenceScore: 20,
        notes: "Thiếu bằng chứng ảnh chụp màn hình xác thực từ phiên duyệt web thực tế.",
        checkedAt,
      };
    }

    // Check disk file existence
    const fullDiskPath = path.resolve(process.cwd(), "public", report.evidence.filePath.replace(/^\//, ""));
    const fileExists = fs.existsSync(fullDiskPath);
    if (!fileExists) {
      return {
        outcome: "INSUFFICIENT_EVIDENCE",
        confidenceScore: 30,
        notes: "Tệp ảnh bằng chứng không tìm thấy trên hệ thống lưu trữ.",
        checkedAt,
      };
    }

    // Verify DOM content
    if (!report.inspection || !report.inspection.title) {
      return {
        outcome: "VERIFIED_FAILURE",
        confidenceScore: 40,
        notes: "Tiêu đề trang web rỗng hoặc không tải được cấu trúc DOM hợp lệ.",
        evidenceId: report.evidence.evidenceId,
        checkedAt,
      };
    }

    return {
      outcome: "VERIFIED_SUCCESS",
      confidenceScore: 95,
      notes: `Đã xác thực thành công qua trình duyệt thực tế. Trang: '${report.inspection.title}', URL cuối: '${report.finalUrl}', Tệp bằng chứng: '${report.evidence.filePath}'.`,
      evidenceId: report.evidence.evidenceId,
      checkedAt,
    };
  }
}

/**
 * Agent E: Supervisor Agent
 * Monitors worker fleet health, tracks heartbeats, detects stalls, and ensures concurrency safety.
 */
export class SupervisorAgent {
  private static registeredBots: Map<string, {
    name: string;
    role: AgentRole;
    status: "IDLE" | "BUSY" | "ERROR";
    currentTaskId?: string;
    lastHeartbeat: number;
    tasksCompleted: number;
    tasksFailed: number;
  }> = new Map();

  static initializeFleet(): void {
    if (this.registeredBots.size === 0) {
      this.registeredBots.set("bot_orchestrator", {
        name: "Master Orchestrator",
        role: "orchestrator",
        status: "IDLE",
        lastHeartbeat: Date.now(),
        tasksCompleted: 0,
        tasksFailed: 0,
      });
      this.registeredBots.set("bot_planner", {
        name: "Task Planner",
        role: "planner",
        status: "IDLE",
        lastHeartbeat: Date.now(),
        tasksCompleted: 0,
        tasksFailed: 0,
      });
      this.registeredBots.set("bot_browser_1", {
        name: "Chromium Worker #1",
        role: "browser_executor",
        status: "IDLE",
        lastHeartbeat: Date.now(),
        tasksCompleted: 0,
        tasksFailed: 0,
      });
      this.registeredBots.set("bot_browser_2", {
        name: "Chromium Worker #2",
        role: "browser_executor",
        status: "IDLE",
        lastHeartbeat: Date.now(),
        tasksCompleted: 0,
        tasksFailed: 0,
      });
      this.registeredBots.set("bot_verifier", {
        name: "Evidence Verifier",
        role: "verifier",
        status: "IDLE",
        lastHeartbeat: Date.now(),
        tasksCompleted: 0,
        tasksFailed: 0,
      });
    }
  }

  static getFleetStatus() {
    this.initializeFleet();
    return Array.from(this.registeredBots.entries()).map(([id, bot]) => ({
      id,
      name: bot.name,
      role: bot.role,
      status: bot.status,
      currentTaskId: bot.currentTaskId,
      lastHeartbeat: new Date(bot.lastHeartbeat).toISOString(),
      tasksCompleted: bot.tasksCompleted,
      tasksFailed: bot.tasksFailed,
      isHealthy: Date.now() - bot.lastHeartbeat < 120000,
    }));
  }

  static setBotBusy(botId: string, taskId: string): void {
    this.initializeFleet();
    const bot = this.registeredBots.get(botId);
    if (bot) {
      bot.status = "BUSY";
      bot.currentTaskId = taskId;
      bot.lastHeartbeat = Date.now();
    }
  }

  static setBotIdle(botId: string, success: boolean): void {
    this.initializeFleet();
    const bot = this.registeredBots.get(botId);
    if (bot) {
      bot.status = "IDLE";
      bot.currentTaskId = undefined;
      bot.lastHeartbeat = Date.now();
      if (success) bot.tasksCompleted += 1;
      else bot.tasksFailed += 1;
    }
  }

  static recordHeartbeat(botId: string): void {
    this.initializeFleet();
    const bot = this.registeredBots.get(botId);
    if (bot) {
      bot.lastHeartbeat = Date.now();
    }
  }
}
