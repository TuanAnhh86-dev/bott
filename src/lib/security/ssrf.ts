import { URL } from "node:url";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "::",
  "metadata.google.internal",
  "169.254.169.254", // AWS/GCP Instance Metadata
]);

/**
 * Validates a target URL before browser navigation.
 * Enforces HTTPS/HTTP protocol and prevents SSRF to internal network, cloud metadata, or loopback.
 * In development or testing, test servers can be whitelisted explicitly.
 */
export function validateTargetUrl(rawUrl: string, allowLocalhostForTesting = false): {
  isValid: boolean;
  sanitizedUrl?: string;
  error?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { isValid: false, error: "Đường dẫn URL không được để trống." };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { isValid: false, error: "Định dạng URL không hợp lệ (cần bao gồm http:// hoặc https://)." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { isValid: false, error: "Chỉ cho phép giao thức http: hoặc https:." };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (allowLocalhostForTesting && (hostname === "localhost" || hostname === "127.0.0.1")) {
    return { isValid: true, sanitizedUrl: parsed.toString() };
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { isValid: false, error: "Không được phép truy cập địa chỉ IP nội bộ hoặc loopback (SSRF Protection)." };
  }

  // Check IPv4 private address ranges
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16
  const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const octet1 = parseInt(ipMatch[1], 10);
    const octet2 = parseInt(ipMatch[2], 10);

    if (
      octet1 === 10 ||
      (octet1 === 172 && octet2 >= 16 && octet2 <= 31) ||
      (octet1 === 192 && octet2 === 168) ||
      (octet1 === 169 && octet2 === 254) ||
      octet1 === 127
    ) {
      return { isValid: false, error: "Địa chỉ IP nằm trong dải mạng nội bộ bị cấm truy cập." };
    }
  }

  return { isValid: true, sanitizedUrl: parsed.toString() };
}

