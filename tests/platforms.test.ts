import { describe, it, expect } from "vitest";
import { PlatformRegistry } from "@/features/platforms/registry";

describe("Platform Adapter Registry", () => {
  it("should have registered all key creator business platforms", () => {
    const platforms = ["patreon", "fanvue", "adobe-stock", "shutterstock", "billo", "gumroad"];
    for (const slug of platforms) {
      const adapter = PlatformRegistry.getAdapter(slug);
      expect(adapter).toBeDefined();
      expect(adapter?.platformSlug).toBe(slug);
    }
  });

  it("should not fabricate policy or analytics data without an integration", async () => {
    const adapter = PlatformRegistry.getAdapter("adobe-stock");
    expect(adapter).toBeDefined();
    await expect(adapter!.getPolicies()).resolves.toEqual([]);
    await expect(adapter!.getAnalytics()).rejects.toThrow("no platform integration is configured");
    await expect(adapter!.getRevenue()).rejects.toThrow("no platform integration is configured");

    const capabilities = await adapter!.getCapabilities();
    expect(capabilities.every((capability) => !capability.isSupported)).toBe(true);
  });

  it("should explicitly reject unverified auto-publishing without API integration", async () => {
    const adapter = PlatformRegistry.getAdapter("patreon");
    expect(adapter).toBeDefined();
    const publishResult = await adapter!.publishContent("test_draft_id");
    expect(publishResult.success).toBe(false);
    expect(publishResult.error).toContain("Direct API");
  });
});
