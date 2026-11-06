const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
  /^169\.254\./,
  /^0\./,
  /^localhost$/i,
  /^\[::1\]$/,
];

export interface SSRFValidationResult {
  isAllowed: boolean;
  sanitizedUrl?: string;
  reason?: string;
}

/**
 * Validates a target URL against SSRF threats, preventing browser bots from hitting private/internal services.
 * In automated unit/integration test suites, local test URLs can be explicitly whitelisted via allowLocalTest = true.
 */
export function validateTargetUrl(rawUrl: string, allowLocalTest = false): SSRFValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isAllowed: false, reason: "Đường dẫn URL không hợp lệ hoặc rỗng." };
  }

  const trimmed = rawUrl.trim();

  // In test mode, allow data: URI for offline HTML fixture testing
  if (allowLocalTest && trimmed.startsWith("data:")) {
    return { isAllowed: true, sanitizedUrl: trimmed };
  }

  // Detect non-HTTP schemes explicitly before prepending https://
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      return { isAllowed: false, reason: "Giao thức không được phép. Chỉ hỗ trợ HTTP và HTTPS." };
    }
  }

  let parsed: URL;
  try {
    const withScheme = trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
    parsed = new URL(withScheme);
  } catch {
    return { isAllowed: false, reason: "Định dạng URL không đúng tiêu chuẩn (RFC 3986)." };
  }

  // Enforce HTTP / HTTPS only
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { isAllowed: false, reason: `Giao thức không được phép: ${parsed.protocol}. Chỉ hỗ trợ HTTP và HTTPS.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Check private IP ranges
  const isPrivate = PRIVATE_IP_PATTERNS.some((pat) => pat.test(hostname));
  if (isPrivate && !allowLocalTest) {
    return {
      isAllowed: false,
      reason: `Chặn bởi SSRF Guard: Không được phép truy cập địa chỉ mạng nội bộ (${hostname}).`,
    };
  }

  return { isAllowed: true, sanitizedUrl: parsed.toString() };
}
