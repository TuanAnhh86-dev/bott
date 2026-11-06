import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { streamText, generateText } from "ai";
import { keyManager } from "./key-manager";

// Supported active Gemini models list in order of priority & reliability
export const FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
];

// Provider cache per API key to reuse instances
const providerCache = new Map<string, ReturnType<typeof createGoogleGenerativeAI>>();

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown AI provider error.";
}

function getErrorStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return undefined;
  return typeof error.statusCode === "number" ? error.statusCode : undefined;
}

export function getProviderForKey(apiKey: string) {
  if (!providerCache.has(apiKey)) {
    providerCache.set(apiKey, createGoogleGenerativeAI({ apiKey }));
  }
  return providerCache.get(apiKey)!;
}

export function getAiModel(modelName?: string, apiKey?: string) {
  const chosenKey = apiKey || keyManager.getNextAvailableKey().key;
  const provider = getProviderForKey(chosenKey);

  let targetModel = modelName || process.env.AI_MODEL_STANDARD || "gemini-3.6-flash";
  if (targetModel === "gemini-2.0-flash" || targetModel === "gemini-1.5-flash" || targetModel === "gemini-2.5-pro") {
    targetModel = "gemini-3.6-flash";
  }

  return provider(targetModel);
}

export interface ResilientStreamOptions {
  system?: string;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  targetModel?: string;
  temperature?: number;
  maxOutputTokens?: number;
  onFinish?: (event: { text: string; usage?: unknown }) => Promise<void> | void;
}

/**
 * Creates a truly resilient text stream with real-time token delivery,
 * multi-key auto-switching, and model fallback chains.
 * If Key 1 hits 429, it automatically rotates to Key 2, Key 3...
 * If Model 1 is retired/404/503, it cascades to gemini-3.6-flash, 3.5-flash, 3.1-flash-lite...
 */
export function createResilientTextStream(options: ResilientStreamOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      let preferredModel = options.targetModel || process.env.AI_MODEL_STANDARD || "gemini-3.6-flash";
      if (preferredModel === "gemini-2.0-flash" || preferredModel === "gemini-1.5-flash" || preferredModel === "gemini-2.5-pro") {
        preferredModel = "gemini-3.6-flash";
      }

      const modelsToTry = [preferredModel, ...FALLBACK_MODELS.filter((m) => m !== preferredModel)];
      let streamedAnyChunk = false;
      let fullAccumulatedText = "";
      let lastErrorMessage = "";

      for (const modelToTry of modelsToTry) {
        if (streamedAnyChunk) break;

        const keysCount = keyManager.getAllKeysStatus().length;

        for (let kAttempt = 0; kAttempt < keysCount; kAttempt++) {
          const { key, index, total } = keyManager.getNextAvailableKey();
          const provider = getProviderForKey(key);
          const model = provider(modelToTry);

          try {
            const streamResult = streamText({
              model,
              system: options.system,
              messages: options.messages,
              temperature: options.temperature ?? 0.7,
              maxOutputTokens: options.maxOutputTokens ?? 2_500,
            });

            for await (const chunk of streamResult.textStream) {
              if (!streamedAnyChunk) {
                // First chunk arrived successfully! Key and Model are verified active.
                keyManager.markKeySuccess(key);
                streamedAnyChunk = true;
              }
              fullAccumulatedText += chunk;
              controller.enqueue(encoder.encode(chunk));
            }

            if (streamedAnyChunk) {
              if (options.onFinish) {
                try {
                  await options.onFinish({ text: fullAccumulatedText });
                } catch (finishErr) {
                  console.warn("[ResilientStream] onFinish callback error:", finishErr);
                }
              }
              controller.close();
              return;
            }
          } catch (err: unknown) {
            const errStr = getErrorMessage(err);
            lastErrorMessage = errStr;
            const statusCode = getErrorStatusCode(err) || (errStr.includes("429") ? 429 : errStr.includes("404") ? 404 : errStr.includes("503") ? 503 : 0);

            console.warn(`[ResilientStream] Model ${modelToTry} với Key #${index}/${total} gặp lỗi:`, errStr.slice(0, 100));

            // If we already sent chunks to the browser, we cannot cleanly restart
            if (streamedAnyChunk) {
              controller.enqueue(encoder.encode("\n\nKết nối AI bị gián đoạn. Vui lòng thử lại."));
              controller.close();
              return;
            }

            if (statusCode === 429 || errStr.includes("quota") || errStr.includes("RESOURCE_EXHAUSTED")) {
              keyManager.markKeyExhausted(key, "Quota Limit 429", 60000);
              console.warn(`[ResilientStream] Key #${index} hết quota! Đang tự động xoay sang tài khoản tiếp theo...`);
              continue; // Try next key in pool
            }

            if (statusCode === 404 || errStr.includes("not found") || errStr.includes("no longer available")) {
              console.warn(`[ResilientStream] Model ${modelToTry} không còn khả dụng. Chuyển sang model fallback tiếp theo...`);
              break; // Try next model in list
            }

            if (statusCode === 503 || errStr.includes("overloaded") || errStr.includes("high demand")) {
              console.warn(`[ResilientStream] Model ${modelToTry} quá tải (503). Chuyển sang model dự phòng...`);
              break; // Try next model
            }

            keyManager.markKeyExhausted(key, `Lỗi: ${errStr.slice(0, 30)}`, 30000);
          }
        }
      }

      // If all keys and fallback models failed before emitting any token:
      if (!streamedAnyChunk) {
        console.error("[ResilientStream] All configured keys and models failed:", lastErrorMessage);
        controller.enqueue(encoder.encode("Hệ thống AI tạm thời không khả dụng. Vui lòng thử lại sau."));
        controller.close();
      }
    },
  });
}

/**
 * Backward compatibility wrapper
 */
export async function executeResilientStream(options: ResilientStreamOptions) {
  const stream = createResilientTextStream(options);
  return {
    toTextStreamResponse: () =>
      new Response(stream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
        },
      }),
  };
}

/**
 * Resilient generateText with automatic key rotation and model fallback
 */
export async function executeResilientText(options: {
  system?: string;
  prompt: string;
  targetModel?: string;
  temperature?: number;
  maxOutputTokens?: number;
}): Promise<{ text: string; modelUsed: string }> {
  let preferredModel = options.targetModel || process.env.AI_MODEL_STANDARD || "gemini-3.6-flash";
  if (preferredModel === "gemini-2.0-flash" || preferredModel === "gemini-1.5-flash" || preferredModel === "gemini-2.5-pro") {
    preferredModel = "gemini-3.6-flash";
  }

  const modelsToTry = [preferredModel, ...FALLBACK_MODELS.filter((m) => m !== preferredModel)];
  const keysStatus = keyManager.getAllKeysStatus();
  const maxKeyAttempts = keysStatus.length;

  let lastError: unknown = keysStatus.length === 0
    ? new Error("No AI API keys are configured.")
    : null;

  for (const modelToTry of modelsToTry) {
    for (let keyAttempt = 0; keyAttempt < maxKeyAttempts; keyAttempt++) {
      const { key, index, total } = keyManager.getNextAvailableKey();
      const provider = getProviderForKey(key);
      const model = provider(modelToTry);

      try {
        const result = await generateText({
          model,
          system: options.system,
          prompt: options.prompt,
          temperature: options.temperature ?? 0.5,
          maxOutputTokens: options.maxOutputTokens ?? 1_200,
        });

        keyManager.markKeySuccess(key);
        return { text: result.text, modelUsed: modelToTry };
      } catch (err: unknown) {
        lastError = err;
        const errMessage = getErrorMessage(err);
        const statusCode = getErrorStatusCode(err) || (errMessage.includes("429") ? 429 : errMessage.includes("404") ? 404 : 0);

        console.warn(`[AI Generator] Thử model ${modelToTry} với Key #${index}/${total} gặp lỗi:`, errMessage.slice(0, 100));

        if (statusCode === 429 || errMessage.includes("quota") || errMessage.includes("RESOURCE_EXHAUSTED")) {
          keyManager.markKeyExhausted(key, "Quota Limit 429", 60000);
          console.warn(`[AI Generator] Đã xoay sang tài khoản tiếp theo do Key #${index} hết quota!`);
          continue;
        }

        if (statusCode === 404 || errMessage.includes("not found") || errMessage.includes("no longer available")) {
          break;
        }

        if (statusCode === 503 || errMessage.includes("overloaded")) {
          break;
        }

        keyManager.markKeyExhausted(key, `Lỗi: ${errMessage.slice(0, 30)}`, 30000);
      }
    }
  }

  throw lastError || new Error("Không thể kết nối AI sau khi đã thử tất cả tài khoản và model dự phòng.");
}
