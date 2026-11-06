import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { validateTargetUrl } from "@/features/browser/ssrf-guard";
import { TaskPlannerAgent, SupervisorAgent, VerificationAgent, ExecutionReport } from "@/features/browser/agents";
import { appendLiveEvent, getRecentLiveEvents, clearLiveEvents } from "@/features/browser/events-bus";

vi.mock("server-only", () => ({}));

describe("Multi-Agent Browser Automation Platform Architecture", () => {
  beforeEach(() => {
    clearLiveEvents();
  });

  describe("SSRF Guard & Target URL Validation", () => {
    it("allows valid public HTTPS target URLs", () => {
      const res = validateTargetUrl("https://toloka.ai");
      expect(res.isAllowed).toBe(true);
      expect(res.sanitizedUrl).toBe("https://toloka.ai/");
    });

    it("strictly blocks loopback and private IP addresses (SSRF Protection)", () => {
      expect(validateTargetUrl("http://127.0.0.1/admin").isAllowed).toBe(false);
      expect(validateTargetUrl("http://localhost:8080").isAllowed).toBe(false);
      expect(validateTargetUrl("http://192.168.1.1/router").isAllowed).toBe(false);
      expect(validateTargetUrl("http://10.0.0.1/internal").isAllowed).toBe(false);
      expect(validateTargetUrl("http://169.254.169.254/latest/meta-data").isAllowed).toBe(false);
    });

    it("rejects non-HTTP protocols", () => {
      expect(validateTargetUrl("file:///etc/passwd").isAllowed).toBe(false);
      expect(validateTargetUrl("javascript:alert(1)").isAllowed).toBe(false);
      expect(validateTargetUrl("ftp://ftp.example.com").isAllowed).toBe(false);
    });
  });

  describe("Task Planner Agent", () => {
    it("plans structured discrete browser actions for legitimate web targets", () => {
      const subtasks = TaskPlannerAgent.planBrowserTask(
        "Kiểm tra trang web khảo sát",
        "https://timebucks.com/surveys"
      );

      expect(subtasks).toBeDefined();
      expect(Array.isArray(subtasks)).toBe(true);
      expect(subtasks.length).toBeGreaterThanOrEqual(1);
      expect(subtasks[0].steps.length).toBeGreaterThanOrEqual(2);
      expect(subtasks[0].steps[0].action).toBe("navigate");
      expect(subtasks[0].steps.some((s) => s.action === "inspect_dom")).toBe(true);
      expect(subtasks[0].steps.some((s) => s.action === "screenshot")).toBe(true);
    });
  });

  describe("Supervisor Agent & Fleet Lifecycle", () => {
    it("initializes a multi-agent fleet with real health metrics", () => {
      SupervisorAgent.initializeFleet();
      const fleet = SupervisorAgent.getFleetStatus();

      expect(fleet.length).toBeGreaterThanOrEqual(5);
      const orchestrator = fleet.find((b) => b.id === "bot_orchestrator");
      expect(orchestrator).toBeDefined();
      expect(orchestrator?.isHealthy).toBe(true);

      const browserWorkers = fleet.filter((b) => b.role === "browser_executor");
      expect(browserWorkers.length).toBeGreaterThanOrEqual(2);
    });

    it("records bot heartbeats and updates bot activity", () => {
      SupervisorAgent.initializeFleet();
      SupervisorAgent.recordHeartbeat("bot_browser_1");
      const fleet = SupervisorAgent.getFleetStatus();
      const bot1 = fleet.find((b) => b.id === "bot_browser_1");

      expect(bot1?.isHealthy).toBe(true);
    });
  });

  describe("Verification Agent", () => {
    it("demands human review when a barrier is detected in execution report", () => {
      const report: ExecutionReport = {
        executionId: "exec_barrier_01",
        taskId: "task_test_barrier",
        botId: "bot_browser_1",
        status: "NEEDS_HUMAN_REVIEW",
        finalUrl: "https://challenge.cloudflare.com",
        humanInterventionReason: "Phát hiện chốt chặn Cloudflare Turnstile Challenge",
        events: [],
        durationMs: 1200,
      };

      const result = VerificationAgent.verifyExecution(report);
      expect(result.outcome).toBe("NEEDS_HUMAN_REVIEW");
      expect(result.notes).toContain("Cloudflare Turnstile");
    });

    it("evaluates verified success when screenshot file exists on disk", () => {
      // Create a test screenshot file
      const testDir = path.resolve(process.cwd(), "public/evidence/screenshots");
      fs.mkdirSync(testDir, { recursive: true });
      const testFile = path.resolve(testDir, "test_verify.png");
      fs.writeFileSync(testFile, "mock image bytes");

      const report: ExecutionReport = {
        executionId: "exec_success_01",
        taskId: "task_test_success",
        botId: "bot_browser_1",
        status: "VERIFYING",
        finalUrl: "https://timebucks.com/surveys",
        inspection: {
          title: "Surveys Dashboard",
          finalUrl: "https://timebucks.com/surveys",
          headings: ["Available Surveys"],
          visibleTextSnippet: "You have 5 surveys available today.",
          formInputCount: 2,
          buttonCount: 4,
          hasBarrier: false,
        },
        evidence: {
          evidenceId: "evi_test_01",
          filePath: "/evidence/screenshots/test_verify.png",
          capturedAt: new Date().toISOString(),
        },
        events: [],
        durationMs: 2500,
      };

      const result = VerificationAgent.verifyExecution(report, "Page loads with non-empty title");
      expect(result.outcome).toBe("VERIFIED_SUCCESS");
      expect(result.confidenceScore).toBeGreaterThanOrEqual(75);

      // Clean up test file
      if (fs.existsSync(testFile)) {
        fs.unlinkSync(testFile);
      }
    });

    it("rejects with INSUFFICIENT_EVIDENCE if no screenshot was captured", () => {
      const report: ExecutionReport = {
        executionId: "exec_no_evi_01",
        taskId: "task_no_evi",
        botId: "bot_browser_1",
        status: "VERIFYING",
        events: [],
        durationMs: 1000,
      };

      const result = VerificationAgent.verifyExecution(report);
      expect(result.outcome).toBe("INSUFFICIENT_EVIDENCE");
    });
  });

  describe("Browser Live Event Bus", () => {
    it("records and retrieves live execution audit events in chronological order", () => {
      appendLiveEvent({
        id: "evt_1",
        executionId: "exec_1",
        taskId: "task_1",
        botId: "bot_browser_1",
        eventType: "BROWSER_LAUNCHED",
        timestamp: new Date().toISOString(),
      });

      appendLiveEvent({
        id: "evt_2",
        executionId: "exec_1",
        taskId: "task_1",
        botId: "bot_browser_1",
        eventType: "PAGE_NAVIGATED",
        url: "https://timebucks.com",
        timestamp: new Date().toISOString(),
      });

      const events = getRecentLiveEvents(10);
      expect(events.length).toBe(2);
      expect(events[0].id).toBe("evt_2"); // Latest first
      expect(events[1].id).toBe("evt_1");
    });
  });
});
