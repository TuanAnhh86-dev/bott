import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { TaskMoneyResearcher } from "@/features/taskmoney/researcher";
import { TaskMoneyOrchestrator } from "@/features/taskmoney/orchestrator";
import { TaskMoneyExecutor } from "@/features/taskmoney/executor";
import { TaskMoneyVerifier } from "@/features/taskmoney/verifier";
import { TaskMoneyFinance } from "@/features/taskmoney/finance";
import { encryptSecret, decryptSecret, maskDestination } from "@/features/taskmoney/encryption";
import { LogicalBalance, TaskMoneyTask } from "@/features/taskmoney/types";

describe("TaskMoney Architecture: Safety, ToS & Multi-Agent Flow", () => {
  describe("1. Researcher & ToS Risk Evaluation", () => {
    it("permits safe sites without strict automation bans", async () => {
      const res = await TaskMoneyResearcher.analyzeSite({
        url: "https://survey-rewards.example/tasks",
        sampleToSText: "Users can complete surveys and microtasks. Fair use applies.",
      });

      expect(res.site.tosAutomationAllowed).toBe(true);
      expect(res.site.riskScore).toBeLessThanOrEqual(6);
      expect(res.analysis.isApprovedForAutomation).toBe(true);
    });

    it("strictly forbids automation when website ToS explicitly prohibits bots", async () => {
      const res = await TaskMoneyResearcher.analyzeSite({
        url: "https://strict-site.example/earn",
        sampleToSText: "Automated access is prohibited. No bots, scripts, or multi-accounting.",
      });

      expect(res.site.tosAutomationAllowed).toBe(false);
      expect(res.site.riskScore).toBeGreaterThanOrEqual(8);
      expect(res.analysis.strategyRecommendation).toContain("FORBIDDEN");
    });

    it("Orchestrator blocks task planning on high-risk ToS sites (Fail-Closed)", async () => {
      const plan = await TaskMoneyOrchestrator.evaluateAndPlan(
        "https://anti-bot-site.example",
        "Strictly forbidden: any automated access or bot will lead to instant account ban."
      );

      expect(plan.allowed).toBe(false);
      expect(plan.reason).toContain("Chặn bởi Chính Sách ToS");
      expect(plan.task).toBeUndefined();
    });

    it("Orchestrator blocks automation if site requires KYC identity verification", async () => {
      const plan = await TaskMoneyOrchestrator.evaluateAndPlan(
        "https://kyc-required.example",
        "Must verify identity with Passport and ID Card verification."
      );

      expect(plan.allowed).toBe(false);
      expect(plan.reason).toContain("KYC");
    });
  });

  describe("2. Executor & Human-in-the-Loop (HITL) Gate", () => {
    const mockTask: TaskMoneyTask = {
      id: "task-1234-uuid",
      siteId: "site-1234-uuid",
      title: "Xem video & khảo sát ý kiến",
      taskUrl: "https://survey.example/task/1",
      instructionSteps: ["Mở trang", "Nhấn nút"],
      expectedRewardVnd: 20000,
      maxDurationSeconds: 120,
      status: "READY",
      priority: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it("completes normal tasks and records browser action logs", async () => {
      const result = await TaskMoneyExecutor.executeTask({
        task: mockTask,
        simulateBarrier: "NONE",
      });

      expect(result.needsHumanIntervention).toBe(false);
      expect(result.execution.status).toBe("COMPLETED");
      expect(result.execution.actualRewardEarned).toBe(20000);
      expect(result.actionLogs.length).toBeGreaterThan(0);
    });

    it("immediately pauses and triggers Human-in-the-Loop when encountering Captcha", async () => {
      const result = await TaskMoneyExecutor.executeTask({
        task: mockTask,
        simulateBarrier: "CAPTCHA",
      });

      expect(result.needsHumanIntervention).toBe(true);
      expect(result.execution.status).toBe("WAITING_HUMAN");
      expect(result.execution.humanInterventionReason).toContain("Turnstile/hCaptcha");
      expect(result.actionLogs.some((l) => l.actionType === "checkpoint_detected")).toBe(true);
    });

    it("pauses and requests user intervention when Phone OTP is required", async () => {
      const result = await TaskMoneyExecutor.executeTask({
        task: mockTask,
        simulateBarrier: "PHONE_OTP",
      });

      expect(result.needsHumanIntervention).toBe(true);
      expect(result.execution.status).toBe("WAITING_HUMAN");
      expect(result.execution.humanInterventionReason).toContain("SMS/Điện thoại");
    });
  });

  describe("3. Verifier: Independent Reward Audit", () => {
    it("confirms valid completed execution reward", async () => {
      const execution = {
        id: "exec-1",
        taskId: "task-1",
        workerName: "taskmoney-executor",
        status: "COMPLETED" as const,
        actualRewardEarned: 25000,
        startedAt: new Date().toISOString(),
      };

      const audit = await TaskMoneyVerifier.verifyReward(execution, "OK");
      expect(audit.verified).toBe(true);
      expect(audit.status).toBe("CONFIRMED");
      expect(audit.confirmedAmountVnd).toBe(25000);
    });

    it("flags discrepancy if site marks account with warnings", async () => {
      const execution = {
        id: "exec-2",
        taskId: "task-2",
        workerName: "taskmoney-executor",
        status: "COMPLETED" as const,
        actualRewardEarned: 25000,
        startedAt: new Date().toISOString(),
      };

      const audit = await TaskMoneyVerifier.verifyReward(execution, "FLAGGED");
      expect(audit.verified).toBe(false);
      expect(audit.status).toBe("FLAGGED_DISCREPANCY");
      expect(audit.confirmedAmountVnd).toBe(0);
    });
  });

  describe("4. Finance Ledger & Cryptographic Approval Gate", () => {
    const mockBalance: LogicalBalance = {
      id: "bal-uuid-1",
      siteId: "site-uuid-1",
      accountId: "acc-uuid-1",
      confirmedBalanceVnd: 500000,
      pendingBalanceVnd: 0,
      lockedForWithdrawalVnd: 0,
      lastReconciliationAt: new Date().toISOString(),
    };

    it("rejects withdrawal if balance is insufficient", async () => {
      await expect(
        TaskMoneyFinance.createWithdrawalDraft(mockBalance, {
          balanceId: mockBalance.id,
          siteId: mockBalance.siteId,
          accountId: mockBalance.accountId,
          destinationType: "paypal",
          destinationAccount: "user@example.com",
          amountVnd: 1000000, // exceeds 500k
        })
      ).rejects.toThrow("không đủ");
    });

    it("creates a withdrawal draft with valid SHA-256 payload hash binding", async () => {
      const draft = await TaskMoneyFinance.createWithdrawalDraft(mockBalance, {
        balanceId: mockBalance.id,
        siteId: mockBalance.siteId,
        accountId: mockBalance.accountId,
        destinationType: "paypal",
        destinationAccount: "testowner@example.com",
        amountVnd: 200000,
      });

      expect(draft.id).toBeDefined();
      expect(draft.approvalStatus).toBe("PENDING");
      expect(draft.amountVnd).toBe(200000);
      expect(draft.approvalPayloadHash).toBeDefined();
      expect(draft.maskedDestination).toBe("te***r@example.com");
    });

    it("approves withdrawal when hash matches perfectly", async () => {
      const destination = "mywallet@paypal.com";
      const draft = await TaskMoneyFinance.createWithdrawalDraft(mockBalance, {
        balanceId: mockBalance.id,
        siteId: mockBalance.siteId,
        accountId: mockBalance.accountId,
        destinationType: "paypal",
        destinationAccount: destination,
        amountVnd: 150000,
      });

      const result = await TaskMoneyFinance.approveWithdrawal(draft, destination, "admin-user-id");
      expect(result.approved).toBe(true);
    });

    it("strictly rejects approval when destination payload is tampered with", async () => {
      const realDestination = "legit@paypal.com";
      const draft = await TaskMoneyFinance.createWithdrawalDraft(mockBalance, {
        balanceId: mockBalance.id,
        siteId: mockBalance.siteId,
        accountId: mockBalance.accountId,
        destinationType: "paypal",
        destinationAccount: realDestination,
        amountVnd: 100000,
      });

      const tamperedDestination = "hacker@paypal.com";
      const result = await TaskMoneyFinance.approveWithdrawal(draft, tamperedDestination, "admin-user-id");
      expect(result.approved).toBe(false);
      expect(result.error).toContain("Payload Hash không khớp");
    });
  });

  describe("5. Security Vault: AES-256 Encryption & Masking", () => {
    it("encrypts and decrypts sensitive credentials symmetrically", () => {
      const plain = "my-super-secret-password-or-token-12345";
      const cipher = encryptSecret(plain);

      expect(cipher.startsWith("v1:")).toBe(true);
      expect(cipher).not.toContain(plain);

      const decrypted = decryptSecret(cipher);
      expect(decrypted).toBe(plain);
    });

    it("correctly masks PayPal email and bank accounts", () => {
      expect(maskDestination("paypal", "vuongcongtuan@gmail.com")).toBe("vu***n@gmail.com");
      expect(maskDestination("bank_transfer", "0399888999")).toBe("••••8999");
    });
  });
});
