import { describe, it, expect, beforeEach } from "vitest";
import { keyManager } from "@/lib/ai/key-manager";

describe("Multi-Account & Key Rotation Manager", () => {
  beforeEach(() => {
    process.env.AI_API_KEYS = "key_alpha_12345678,key_beta_12345678,key_gamma_12345678";
    keyManager.refreshKeys();
  });

  it("should load all provided accounts into the key pool", () => {
    const status = keyManager.getAllKeysStatus();
    expect(status.length).toBe(3);
    expect(status.every(k => k.isAvailable)).toBe(true);
  });

  it("should rotate sequentially in round-robin fashion", () => {
    const k1 = keyManager.getNextAvailableKey();
    const k2 = keyManager.getNextAvailableKey();
    const k3 = keyManager.getNextAvailableKey();

    expect(k1.key).toContain("key_alpha");
    expect(k2.key).toContain("key_beta");
    expect(k3.key).toContain("key_gamma");
  });

  it("should automatically bypass exhausted keys and rotate to healthy ones", () => {
    // Mark key_alpha as exhausted with quota limit 429
    keyManager.markKeyExhausted("key_alpha_12345678", "Quota Limit 429", 60000);

    const status = keyManager.getAllKeysStatus();
    expect(status[0].isAvailable).toBe(false);

    // Now requests should skip alpha and only use beta or gamma
    const next1 = keyManager.getNextAvailableKey();
    expect(next1.key).not.toContain("key_alpha");
    expect(next1.key).toContain("key_beta");
  });

  it("should reset all cooldowns when requested", () => {
    keyManager.markKeyExhausted("key_alpha_12345678", "Quota 429", 60000);
    expect(keyManager.getAllKeysStatus()[0].isAvailable).toBe(false);

    keyManager.resetAllCooldowns();
    expect(keyManager.getAllKeysStatus()[0].isAvailable).toBe(true);
  });

  it("should safely remove a key from pool", () => {
    const initialTotal = keyManager.getAllKeysStatus().length;
    const res = keyManager.removeKey(2); // Remove key_beta
    expect(res.removed).toBe(true);
    expect(keyManager.getAllKeysStatus().length).toBe(initialTotal - 1);
  });
});
