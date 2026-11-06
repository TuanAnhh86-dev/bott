export interface KeyStatus {
  index: number;
  maskedKey: string;
  isAvailable: boolean;
  failCount: number;
  exhaustedUntil: number | null;
  lastUsedAt: number | null;
  reason?: string;
}

class KeyManager {
  private keys: string[] = [];
  private runtimeKeys: string[] = [];
  private disabledKeys = new Set<string>();
  private currentIndex: number = 0;
  private keyStates: Map<string, {
    failCount: number;
    exhaustedUntil: number | null;
    lastUsedAt: number | null;
    reason?: string;
  }> = new Map();

  constructor() {
    this.refreshKeys();
  }

  public refreshKeys() {
    const rawKeys: string[] = [];

    // 1. Check AI_API_KEYS (comma or newline separated)
    if (process.env.AI_API_KEYS) {
      process.env.AI_API_KEYS.split(/[,\n]/).forEach(k => {
        const trimmed = k.trim();
        if (trimmed && !rawKeys.includes(trimmed)) rawKeys.push(trimmed);
      });
    }

    // 2. Check AI_API_KEY (can be single or comma separated)
    if (process.env.AI_API_KEY) {
      process.env.AI_API_KEY.split(",").forEach(k => {
        const trimmed = k.trim();
        if (trimmed && !rawKeys.includes(trimmed)) rawKeys.push(trimmed);
      });
    }

    // 3. Check numbered keys: AI_API_KEY_1, AI_API_KEY_2, ...
    for (let i = 1; i <= 20; i++) {
      const val = process.env[`AI_API_KEY_${i}`];
      if (val) {
        const trimmed = val.trim();
        if (trimmed && !rawKeys.includes(trimmed)) rawKeys.push(trimmed);
      }
    }

    for (const key of this.runtimeKeys) {
      if (!rawKeys.includes(key)) rawKeys.push(key);
    }

    this.keys = rawKeys.filter((key) => !this.disabledKeys.has(key));

    // Ensure all keys have an entry in keyStates
    for (const k of this.keys) {
      if (!this.keyStates.has(k)) {
        this.keyStates.set(k, {
          failCount: 0,
          exhaustedUntil: null,
          lastUsedAt: null,
        });
      }
    }
  }

  public addKeys(newKeys: string[]): { added: number; total: number } {
    let addedCount = 0;
    for (const raw of newKeys) {
      const trimmed = raw.trim();
      if (trimmed && !this.keys.includes(trimmed)) {
        this.keys.push(trimmed);
        this.runtimeKeys.push(trimmed);
        this.disabledKeys.delete(trimmed);
        this.keyStates.set(trimmed, {
          failCount: 0,
          exhaustedUntil: null,
          lastUsedAt: null,
        });
        addedCount++;
      }
    }

    return { added: addedCount, total: this.keys.length };
  }

  public getNextAvailableKey(): { key: string; index: number; total: number } {
    this.refreshKeys();
    const now = Date.now();
    const total = this.keys.length;
    if (total === 0) {
      throw new Error("No AI API keys are configured. Set AI_API_KEY or AI_API_KEYS in the server environment.");
    }

    // Try finding a healthy key starting from currentIndex
    for (let attempt = 0; attempt < total; attempt++) {
      const idx = (this.currentIndex + attempt) % total;
      const candidateKey = this.keys[idx];
      const state = this.keyStates.get(candidateKey);

      // Check if exhausted period has passed
      if (state?.exhaustedUntil && state.exhaustedUntil <= now) {
        state.exhaustedUntil = null;
        state.failCount = 0;
      }

      if (!state?.exhaustedUntil) {
        this.currentIndex = (idx + 1) % total;
        state!.lastUsedAt = now;
        return { key: candidateKey, index: idx + 1, total };
      }
    }

    // If ALL keys are exhausted, fallback to the one whose exhaustedUntil expires earliest
    let earliestKey = this.keys[0];
    let earliestExpiry = Infinity;
    let earliestIdx = 0;

    for (let i = 0; i < total; i++) {
      const k = this.keys[i];
      const expiry = this.keyStates.get(k)?.exhaustedUntil || 0;
      if (expiry < earliestExpiry) {
        earliestExpiry = expiry;
        earliestKey = k;
        earliestIdx = i;
      }
    }

    console.warn(`[KeyManager] Tất cả ${total} tài khoản/key đều đang bị quota limit. Dùng tạm tài khoản #${earliestIdx + 1}`);
    return { key: earliestKey, index: earliestIdx + 1, total };
  }

  public markKeyExhausted(key: string, reason: string = "Quota 429", durationMs: number = 60000) {
    const state = this.keyStates.get(key) || {
      failCount: 0,
      exhaustedUntil: null,
      lastUsedAt: null,
    };

    state.failCount += 1;
    const backoffMultiplier = Math.min(10, Math.pow(2, Math.max(0, state.failCount - 1)));
    const lockout = durationMs * backoffMultiplier;
    state.exhaustedUntil = Date.now() + lockout;
    state.reason = reason;

    this.keyStates.set(key, state);

    const masked = this.maskKey(key);
    console.warn(
      `[KeyManager] ⚠️ Tài khoản ${masked} bị lỗi (${reason}). Tự động khóa tạm thời ${Math.round(lockout / 1000)}s và chuyển sang tài khoản khác!`
    );
  }

  public markKeySuccess(key: string) {
    const state = this.keyStates.get(key);
    if (state) {
      state.failCount = 0;
      state.exhaustedUntil = null;
      state.reason = undefined;
    }
  }

  public resetAllCooldowns() {
    for (const [, state] of this.keyStates.entries()) {
      state.failCount = 0;
      state.exhaustedUntil = null;
      state.reason = undefined;
    }
    console.log("[KeyManager] Đã khôi phục trạng thái tất cả tài khoản/keys.");
  }

  public removeKey(index: number): { removed: boolean; total: number } {
    const targetIdx = index - 1;
    if (targetIdx < 0 || targetIdx >= this.keys.length) {
      return { removed: false, total: this.keys.length };
    }

    const removedKey = this.keys.splice(targetIdx, 1)[0];
    this.runtimeKeys = this.runtimeKeys.filter((key) => key !== removedKey);
    this.disabledKeys.add(removedKey);
    this.keyStates.delete(removedKey);

    return { removed: true, total: this.keys.length };
  }

  public async testKey(keyOrIndex: string | number): Promise<{
    valid: boolean;
    quotaAvailable: boolean;
    latencyMs: number;
    message: string;
    modelTested: string;
  }> {
    const keyToTest = typeof keyOrIndex === "number" ? this.keys[keyOrIndex - 1] : keyOrIndex;
    if (!keyToTest) {
      return { valid: false, quotaAvailable: false, latencyMs: 0, message: "Không tìm thấy key", modelTested: "" };
    }

    const start = Date.now();
    const testModel = "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${testModel}:generateContent`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": keyToTest,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const latencyMs = Date.now() - start;
      const data = await res.json();

      if (res.ok) {
        this.markKeySuccess(keyToTest);
        return {
          valid: true,
          quotaAvailable: true,
          latencyMs,
          message: `Sẵn sàng (200 OK - ${latencyMs}ms)`,
          modelTested: testModel,
        };
      }

      if (res.status === 429) {
        this.markKeyExhausted(keyToTest, "Quota 429", 60000);
        return {
          valid: true,
          quotaAvailable: false,
          latencyMs,
          message: `Hết Quota 429 (${data?.error?.message?.slice(0, 70) || "Rate Limit"})`,
          modelTested: testModel,
        };
      }

      return {
        valid: false,
        quotaAvailable: false,
        latencyMs,
        message: `Lỗi API (${res.status}): ${data?.error?.message?.slice(0, 70) || "Key không hợp lệ"}`,
        modelTested: testModel,
      };
    } catch (netErr: unknown) {
      return {
        valid: false,
        quotaAvailable: false,
        latencyMs: Date.now() - start,
        message: `Lỗi mạng khi kiểm tra: ${netErr instanceof Error ? netErr.message : "Timeout"}`,
        modelTested: testModel,
      };
    }
  }

  public getAllKeysStatus(): KeyStatus[] {
    const now = Date.now();
    return this.keys.map((k, idx) => {
      const state = this.keyStates.get(k);
      const isAvailable = !state?.exhaustedUntil || state.exhaustedUntil <= now;
      return {
        index: idx + 1,
        maskedKey: this.maskKey(k),
        isAvailable,
        failCount: state?.failCount || 0,
        exhaustedUntil: state?.exhaustedUntil || null,
        lastUsedAt: state?.lastUsedAt || null,
        reason: state?.reason,
      };
    });
  }

  public maskKey(k: string): string {
    if (!k || k.length <= 8) return "key-***";
    return `${k.slice(0, 4)}...${k.slice(-4)}`;
  }
}

export const keyManager = new KeyManager();
