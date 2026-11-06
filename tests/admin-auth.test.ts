import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { getAdminIdentity, requireAdminApi } from "@/lib/security/admin-auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

describe("Admin authentication", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not grant a development identity when session verification fails", async () => {
    vi.mocked(createServerSupabaseClient).mockRejectedValue(new Error("auth unavailable"));

    await expect(getAdminIdentity()).resolves.toBeNull();
    const result = await requireAdminApi();
    expect(result.response?.status).toBe(401);
  });

  it("does not trust forged role claims from the authenticated user token", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "4cfb186b-f493-4fb3-b7d1-6387bf34903e",
              email: "viewer@example.com",
              app_metadata: { role: "super_admin" },
            },
          },
          error: null,
        }),
      },
    } as never);

    const profileQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { role: "viewer", is_active: true },
        error: null,
      }),
    };
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(profileQuery),
    } as never);

    await expect(getAdminIdentity()).resolves.toBeNull();
  });
});
