import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { 
  evaluateActionPermission, 
  FORBIDDEN_ACTIONS, 
  AUTO_EXECUTE_ACTIONS, 
  REQUIRE_APPROVAL_ACTIONS 
} from "@/lib/security/permissions";
import * as emergencyModule from "@/lib/security/emergency";
import * as adminModule from "@/lib/supabase/admin";

describe("Policy and Permission Gate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock Supabase admin client to avoid network latency in unit tests
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof adminModule.createAdminClient>);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should permit AUTO_EXECUTE actions for safe internal tasks", async () => {
    vi.spyOn(emergencyModule, "isEmergencyStopActive").mockResolvedValue(false);

    for (const action of AUTO_EXECUTE_ACTIONS) {
      const result = await evaluateActionPermission(action, "internal_target");
      expect(result.allowed).toBe(true);
      expect(result.category).toBe("AUTO_EXECUTE");
      expect(result.requiresApproval).toBe(false);
      expect(result.riskLevel).toBe("low");
    }
  });

  it("should block and mark REQUIRE_APPROVAL for sensitive external/financial actions", async () => {
    vi.spyOn(emergencyModule, "isEmergencyStopActive").mockResolvedValue(false);

    for (const action of REQUIRE_APPROVAL_ACTIONS) {
      const result = await evaluateActionPermission(action, "external_target");
      expect(result.allowed).toBe(false);
      expect(result.category).toBe("REQUIRE_APPROVAL");
      expect(result.requiresApproval).toBe(true);
      expect(result.riskLevel).toBe("high");
    }
  });

  it("should strictly forbid and block FORBIDDEN actions unconditionally", async () => {
    vi.spyOn(emergencyModule, "isEmergencyStopActive").mockResolvedValue(false);

    for (const action of FORBIDDEN_ACTIONS) {
      const result = await evaluateActionPermission(action, "forbidden_target");
      expect(result.allowed).toBe(false);
      expect(result.category).toBe("FORBIDDEN");
      expect(result.requiresApproval).toBe(false);
      expect(result.riskLevel).toBe("critical");
      expect(result.reason).toContain("BỊ CẤM TUYỆT ĐỐI");
    }
  });

  it("allows only approval-required actions with a separately verified approval", async () => {
    vi.spyOn(emergencyModule, "isEmergencyStopActive").mockResolvedValue(false);

    const approved = await evaluateActionPermission(
      "external_communication_new",
      "external_target",
      {},
      true
    );
    expect(approved.allowed).toBe(true);
    expect(approved.requiresApproval).toBe(false);

    const forbidden = await evaluateActionPermission(FORBIDDEN_ACTIONS[0], "forbidden_target", {}, true);
    expect(forbidden.allowed).toBe(false);
    expect(forbidden.category).toBe("FORBIDDEN");
  });

  it("should block ALL actions when Emergency Stop is activated", async () => {
    vi.spyOn(emergencyModule, "isEmergencyStopActive").mockResolvedValue(true);

    const safeResult = await evaluateActionPermission("external_communication_new", "web", {}, true);
    expect(safeResult.allowed).toBe(false);
    expect(safeResult.category).toBe("FORBIDDEN");
    expect(safeResult.reason).toContain("DỪNG KHẨN CẤP");
    expect(safeResult.riskLevel).toBe("critical");
  });

  it("should require manual review when database policy cannot be verified", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(emergencyModule, "isEmergencyStopActive").mockResolvedValue(false);
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "database unavailable" } }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof adminModule.createAdminClient>);

    const result = await evaluateActionPermission("public_web_research", "public web");
    expect(result.allowed).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });
});
