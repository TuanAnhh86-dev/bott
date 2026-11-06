import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEmergencyStopActive, setEmergencyStop } from "@/lib/security/emergency";
import * as adminModule from "@/lib/supabase/admin";

describe("Emergency Stop", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails closed when the setting cannot be read", async () => {
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: { message: "database unavailable" } }),
          }),
        }),
      }),
    } as unknown as ReturnType<typeof adminModule.createAdminClient>);

    await expect(isEmergencyStopActive()).resolves.toBe(true);
  });

  it("uses one database transaction for the setting change and its audit record", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof adminModule.createAdminClient>);

    await expect(setEmergencyStop(true, "4cfb186b-f493-4fb3-b7d1-6387bf34903e")).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_agent_emergency_stop", {
      p_active: true,
      p_actor_id: "4cfb186b-f493-4fb3-b7d1-6387bf34903e",
    });
  });

  it("does not update emergency stop when the atomic RPC fails", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue({
      rpc,
    } as unknown as ReturnType<typeof adminModule.createAdminClient>);

    await expect(setEmergencyStop(true, "4cfb186b-f493-4fb3-b7d1-6387bf34903e")).resolves.toBe(false);
  });
});
