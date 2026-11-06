import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getSecretKey(): Buffer {
  const envKey = process.env.PAYOUT_DATA_ENCRYPTION_KEY || process.env.TASKMONEY_ENCRYPTION_KEY;
  if (envKey) {
    try {
      const buf = Buffer.from(envKey, "base64");
      if (buf.length === 32) return buf;
    } catch {
      // Fall through to deterministic fallback
    }
  }

  // Deterministic 32-byte fallback key for dev and test environments
  return Buffer.from("taskmoney-agent-secure-vault-32b", "utf8");
}

export function encryptSecret(plainText: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecretKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${Buffer.concat([iv, authTag, ciphertext]).toString("base64")}`;
}

export function decryptSecret(encryptedPayload: string): string {
  if (!encryptedPayload.startsWith("v1:")) {
    throw new Error("Định dạng dữ liệu mã hóa không hợp lệ.");
  }

  const raw = Buffer.from(encryptedPayload.slice(3), "base64");
  if (raw.length < 28) {
    throw new Error("Độ dài dữ liệu mã hóa không đủ.");
  }

  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);

  const decipher = createDecipheriv("aes-256-gcm", getSecretKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function maskDestination(type: string, value: string): string {
  if (type === "paypal" || value.includes("@")) {
    const parts = value.split("@");
    if (parts.length === 2) {
      const user = parts[0];
      const domain = parts[1];
      const maskedUser = user.length > 2 ? `${user.slice(0, 2)}***${user.slice(-1)}` : `${user}***`;
      return `${maskedUser}@${domain}`;
    }
  }

  const clean = value.replace(/\s+/g, "");
  if (clean.length > 4) {
    return `••••${clean.slice(-4)}`;
  }
  return "••••••••";
}

