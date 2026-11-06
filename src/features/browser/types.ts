export type AgentRole = "orchestrator" | "planner" | "browser_executor" | "verifier" | "supervisor";

export type BotStatus = "IDLE" | "BUSY" | "OFFLINE" | "ERROR" | "PAUSED";

export type TaskLifecycleStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "QUEUED"
  | "ASSIGNED"
  | "RUNNING"
  | "VERIFYING"
  | "VERIFIED_SUCCESS"
  | "VERIFIED_FAILURE"
  | "NEEDS_HUMAN_REVIEW"
  | "PAUSED"
  | "CANCELLED";

export type BrowserEventType =
  | "BOT_STARTED"
  | "BOT_ONLINE"
  | "TASK_ASSIGNED"
  | "TASK_STARTED"
  | "BROWSER_LAUNCHED"
  | "PAGE_NAVIGATED"
  | "DOM_INSPECTED"
  | "ELEMENT_CLICKED"
  | "FORM_FILLED"
  | "SCREENSHOT_CAPTURED"
  | "BARRIER_DETECTED"
  | "HUMAN_REVIEW_REQUIRED"
  | "VERIFICATION_STARTED"
  | "VERIFIED_SUCCESS"
  | "VERIFIED_FAILURE"
  | "TASK_COMPLETED"
  | "TASK_FAILED"
  | "TASK_CANCELLED";

export interface BotWorkerEntity {
  id: string;
  name: string;
  agentRole: AgentRole;
  status: BotStatus;
  currentTaskId: string | null;
  currentUrl: string | null;
  browserContextId?: string | null;
  tasksCompleted: number;
  tasksFailed: number;
  lastHeartbeat: string;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface BrowserActionStep {
  action: "navigate" | "click" | "fill" | "scroll" | "wait" | "inspect_dom" | "screenshot";
  selector?: string;
  value?: string;
  timeoutMs?: number;
  description?: string;
}

export interface PageInspectionResult {
  title: string;
  finalUrl: string;
  httpStatus?: number;
  headings: string[];
  visibleTextSnippet: string;
  formInputCount: number;
  buttonCount: number;
  hasBarrier: boolean;
  barrierType?: "CAPTCHA" | "PHONE_OTP" | "LOGIN_2FA" | "CLOUDFLARE_CHALLENGE";
}

export interface ScreenshotEvidence {
  evidenceId: string;
  filePath: string;
  base64Thumbnail?: string;
  capturedAt: string;
}

export interface BrowserExecutionLog {
  id: string;
  executionId: string;
  taskId: string;
  botId: string;
  eventType: BrowserEventType;
  url?: string;
  stepName?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface VerificationResult {
  outcome: "VERIFIED_SUCCESS" | "VERIFIED_FAILURE" | "NEEDS_HUMAN_REVIEW" | "INSUFFICIENT_EVIDENCE";
  confidenceScore: number; // 0 - 100
  notes: string;
  evidenceId?: string;
  checkedAt: string;
}
