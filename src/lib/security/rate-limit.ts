interface RateLimitEntry {
  minuteStartedAt: number;
  minuteCount: number;
  hourStartedAt: number;
  hourCount: number;
}

const entries = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  key: string,
  limits: { perMinute: number; perHour: number },
  now = Date.now()
): boolean {
  let entry = entries.get(key);

  if (!entry || now - entry.hourStartedAt >= 60 * 60 * 1_000) {
    entry = {
      minuteStartedAt: now,
      minuteCount: 0,
      hourStartedAt: now,
      hourCount: 0,
    };
    entries.set(key, entry);
  } else if (now - entry.minuteStartedAt >= 60 * 1_000) {
    entry.minuteStartedAt = now;
    entry.minuteCount = 0;
  }

  if (entry.minuteCount >= limits.perMinute || entry.hourCount >= limits.perHour) {
    return false;
  }

  entry.minuteCount += 1;
  entry.hourCount += 1;

  if (entries.size > 10_000) {
    for (const [entryKey, value] of entries) {
      if (now - value.hourStartedAt >= 60 * 60 * 1_000) entries.delete(entryKey);
    }
  }

  return true;
}

export function getClientAddress(request: Request): string {
  return request.headers.get("x-real-ip")
    ?? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}
