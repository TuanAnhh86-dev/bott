export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface GoldenSurveyPersona {
  targetAge: number;
  ageRange: string;
  maritalStatus: string;
  hasChildren: boolean;
  locations: string[];
  familyRole: string;
  householdIncomeVnd: string;
  excludedIndustries: string[];
  answeringStrategy: string;
}

export interface SiteAnalysisResult {
  domain: string;
  baseUrl: string;
  platformName: string;
  tosSummary: string;
  automationAllowed: boolean;
  automationRiskScore: number;
  requiresKyc: boolean;
  requiresPhoneOtp: boolean;
  minPayoutUsd: number;
  payoutMethods: string[];
  safeActionGuidelines: string;
}

export interface TaskMoneySite {
  id: string;
  domain: string;
  siteName: string;
  baseUrl: string;
  category: "survey" | "microtask" | "testing" | "affiliate" | "task_earning";
  tosAutomationAllowed: boolean;
  tosSummary: string | null;
  riskScore: number; // 1-10
  requiresKyc: boolean;
  minWithdrawalVnd: number;
  supportedPayoutMethods: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SiteAnalysis {
  id: string;
  siteId: string;
  researcherAgentVersion: string;
  tosTextSnapshot?: string;
  antiBotSystems: string[];
  humanCheckpoints: string[];
  earningPotentialRating: "LOW" | "MEDIUM" | "HIGH";
  strategyRecommendation: string;
  isApprovedForAutomation: boolean;
  createdAt: string;
}

export interface TaskMoneyAccount {
  id: string;
  siteId: string;
  usernameAlias: string;
  accountStatus: "active" | "warning" | "banned" | "cooldown";
  currentSiteBalance: number;
  currency: string;
  lastVerifiedAt?: string;
  metadata?: Record<string, unknown>;
}

export type TaskStatus =
  | "PENDING"
  | "ANALYZING"
  | "READY"
  | "RUNNING"
  | "WAITING_HUMAN"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface TaskMoneyTask {
  id: string;
  siteId: string;
  title: string;
  taskUrl: string;
  instructionSteps: string[];
  expectedRewardVnd: number;
  maxDurationSeconds: number;
  status: TaskStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskExecution {
  id: string;
  taskId: string;
  accountId?: string;
  workerName: string;
  status: "RUNNING" | "WAITING_HUMAN" | "COMPLETED" | "FAILED";
  actualRewardEarned: number;
  browserSessionId?: string;
  humanInterventionReason?: string;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

export interface BrowserActionLog {
  id?: string;
  executionId: string;
  actionType: "navigate" | "click" | "input" | "wait_element" | "screenshot" | "checkpoint_detected";
  targetSelector?: string;
  actionDetails?: Record<string, unknown>;
  screenshotUrl?: string;
  status: "success" | "failed" | "blocked_captcha";
  createdAt?: string;
}

export interface LogicalBalance {
  id: string;
  siteId: string;
  accountId: string;
  confirmedBalanceVnd: number;
  pendingBalanceVnd: number;
  lockedForWithdrawalVnd: number;
  lastReconciliationAt: string;
}

export type WithdrawalStatus =
  | "PENDING"
  | "APPROVED_BY_HUMAN"
  | "REJECTED_BY_HUMAN"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

export interface WithdrawalRequest {
  id: string;
  balanceId: string;
  destinationType: "paypal" | "bank_transfer" | "crypto_usdt";
  maskedDestination: string;
  amountVnd: number;
  feeVnd: number;
  approvalStatus: WithdrawalStatus;
  approvalPayloadHash: string;
  approvedBy?: string;
  approvedAt?: string;
  payoutEvidenceReference?: string;
  createdAt: string;
}
