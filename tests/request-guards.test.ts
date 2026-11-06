import { describe, expect, it } from "vitest";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";

describe("API request security guards", () => {
  it("rejects cross-origin and missing-origin browser mutation requests", () => {
    const crossOrigin = new Request("https://emmi.example/api/tasks", {
      method: "POST",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
      body: "{}",
    });
    const missingOrigin = new Request("https://emmi.example/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(validateSameOriginJsonRequest(crossOrigin)?.status).toBe(403);
    expect(validateSameOriginJsonRequest(missingOrigin)?.status).toBe(403);
  });

  it("rejects simple content types and accepts same-origin JSON", () => {
    const textRequest = new Request("https://emmi.example/api/tasks", {
      method: "POST",
      headers: { origin: "https://emmi.example", "content-type": "text/plain" },
      body: "{}",
    });
    const jsonRequest = new Request("https://emmi.example/api/tasks", {
      method: "POST",
      headers: { origin: "https://emmi.example", "content-type": "application/json" },
      body: "{}",
    });

    expect(validateSameOriginJsonRequest(textRequest)?.status).toBe(415);
    expect(validateSameOriginJsonRequest(jsonRequest)).toBeNull();
  });

  it("bounds streamed JSON bodies and returns parse errors as client errors", async () => {
    const oversized = new Request("https://emmi.example/api/tasks", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(128) }),
    });
    const malformed = new Request("https://emmi.example/api/tasks", {
      method: "POST",
      body: "{invalid",
    });
    const valid = new Request("https://emmi.example/api/tasks", {
      method: "POST",
      body: JSON.stringify({ action: "cancel" }),
    });

    const oversizedResult = await readJsonBody(oversized, 32);
    expect(oversizedResult.success).toBe(false);
    if (!oversizedResult.success) expect(oversizedResult.response.status).toBe(413);

    const malformedResult = await readJsonBody(malformed);
    expect(malformedResult.success).toBe(false);
    if (!malformedResult.success) expect(malformedResult.response.status).toBe(400);

    await expect(readJsonBody(valid)).resolves.toEqual({ success: true, data: { action: "cancel" } });
  });
});
