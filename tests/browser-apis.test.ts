import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/admin-auth", () => ({
  requireAdminApi: vi.fn().mockResolvedValue({
    identity: { id: "admin-test-1", email: "admin@emmi.local", role: "admin" },
    response: null,
  }),
}));

import { GET as getBots } from "@/app/api/browser/bots/route";
import { GET as getEvents } from "@/app/api/browser/events/route";
import { appendLiveEvent, getRecentLiveEvents } from "@/features/browser/events-bus";

describe("Browser Automation API Endpoints", () => {
  it("GET /api/browser/bots returns initialized multi-agent fleet", async () => {
    const res = await getBots();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.totalBots).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(data.bots)).toBe(true);
  });

  it("Event Bus registers and returns discrete real-time events", async () => {
    appendLiveEvent({
      id: "evt_test_1",
      executionId: "exec_test",
      taskId: "task_test",
      botId: "bot_browser_1",
      eventType: "PAGE_NAVIGATED",
      url: "https://timebucks.com",
      timestamp: new Date().toISOString(),
    });

    const events = getRecentLiveEvents(10);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0].eventType).toBe("PAGE_NAVIGATED");

    const apiRes = await getEvents();
    expect(apiRes.status).toBe(200);
    const apiData = await apiRes.json();
    expect(apiData.success).toBe(true);
    expect(apiData.events.length).toBeGreaterThanOrEqual(1);
  });
});
