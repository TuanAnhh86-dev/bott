import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/admin-auth", () => ({
  requireAdminApi: vi.fn(),
}));
vi.mock("@/features/agent/task-store", () => ({
  TaskStore: {
    getAllTasks: vi.fn(),
    addTask: vi.fn(),
    approveTask: vi.fn(),
    cancelTask: vi.fn(),
  },
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/agent/tasks/route";
import { requireAdminApi } from "@/lib/security/admin-auth";

describe("Admin mutation route protections", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects cross-origin task mutations before authenticating or changing state", async () => {
    const request = new NextRequest("https://emmi.example/api/agent/tasks", {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "create", title: "Injected task" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(requireAdminApi).not.toHaveBeenCalled();
  });

  it("rejects simple content types rather than trusting JSON-looking text bodies", async () => {
    const request = new NextRequest("https://emmi.example/api/agent/tasks", {
      method: "POST",
      headers: {
        origin: "https://emmi.example",
        "content-type": "text/plain",
      },
      body: JSON.stringify({ action: "create", title: "Injected task" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(415);
    expect(requireAdminApi).not.toHaveBeenCalled();
  });
});
