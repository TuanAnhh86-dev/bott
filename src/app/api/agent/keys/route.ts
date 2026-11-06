import { NextRequest, NextResponse } from "next/server";
import { keyManager } from "@/lib/ai/key-manager";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { workerPool } from "@/features/agent/worker-pool";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { z } from "zod";

const requestSchema = z.object({
  action: z.enum(["add", "test", "remove", "reset"]).default("add"),
  keys: z.union([
    z.array(z.string().trim().min(20).max(256)).max(10),
    z.string().max(3_000),
  ]).optional(),
  index: z.number().int().positive().optional(),
}).strict();

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const keys = keyManager.getAllKeysStatus();
    return NextResponse.json({
      success: true,
      totalKeys: keys.length,
      availableKeys: keys.filter((k) => k.isAvailable).length,
      keys,
    });
  } catch (err: unknown) {
    console.error("Could not load AI key status:", err);
    return NextResponse.json({ error: "Không thể tải trạng thái tài khoản AI." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const requestError = validateSameOriginJsonRequest(req);
  if (requestError) return requestError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  if (auth.identity.role !== "super_admin") {
    return NextResponse.json({ error: "Chỉ super_admin được thay đổi pool tài khoản AI." }, { status: 403 });
  }

  try {
    if (!checkRateLimit(`admin-keys:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 5, perHour: 30 })) {
      return NextResponse.json({ error: "Quá nhiều yêu cầu quản lý key. Vui lòng thử lại sau." }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const bodyResult = await readJsonBody(req);
    if (!bodyResult.success) return bodyResult.response;
    const parsed = requestSchema.safeParse(bodyResult.data);
    if (!parsed.success) {
      return NextResponse.json({ error: "Thông tin tài khoản AI không hợp lệ." }, { status: 400 });
    }
    const body = parsed.data;
    const action = body.action;

    if (action === "add") {
      let keysToAdd: string[] = [];
      if (Array.isArray(body.keys)) {
        keysToAdd = body.keys;
      } else if (typeof body.keys === "string") {
        keysToAdd = body.keys
          .split(/[\n,]/)
          .map((k: string) => k.trim())
          .filter(Boolean);
      }

      if (keysToAdd.length === 0) {
        return NextResponse.json(
          { error: "Vui lòng nhập ít nhất một Gemini API Key hợp lệ" },
          { status: 400 }
        );
      }

      if (keysToAdd.length > 10 || keysToAdd.some((key) => key.length < 20 || key.length > 256)) {
        return NextResponse.json({ error: "Một hoặc nhiều API key không hợp lệ." }, { status: 400 });
      }

      const res = keyManager.addKeys(keysToAdd);
      const updatedKeys = keyManager.getAllKeysStatus();

      return NextResponse.json({
        success: true,
        message: `Đã thêm ${res.added} key vào bộ nhớ của phiên chạy hiện tại. Cấu hình biến môi trường để giữ key sau khi khởi động lại.`,
        added: res.added,
        totalKeys: updatedKeys.length,
        availableKeys: updatedKeys.filter((k) => k.isAvailable).length,
        keys: updatedKeys,
      });
    }

    if (action === "test") {
      const { index } = body;
      if (!index) {
        return NextResponse.json({ error: "Thiếu index key cần kiểm tra." }, { status: 400 });
      }

      const testResult = await keyManager.testKey(index);
      const updatedKeys = keyManager.getAllKeysStatus();

      return NextResponse.json({
        success: true,
        testResult,
        keys: updatedKeys,
      });
    }

    if (action === "remove") {
      const { index } = body;
      if (typeof index !== "number" || index < 1) {
        return NextResponse.json({ error: "Index key không hợp lệ" }, { status: 400 });
      }

      const runningWorker = workerPool.getFleetStatus().workers.find(
        (worker) => worker.keyIndex === index && worker.status === "RUNNING"
      );
      if (runningWorker) {
        return NextResponse.json(
          { error: "Không thể xóa key đang được worker sử dụng." },
          { status: 409 }
        );
      }

      const res = keyManager.removeKey(index);
      const updatedKeys = keyManager.getAllKeysStatus();

      return NextResponse.json({
        success: res.removed,
        message: res.removed ? "Đã xóa tài khoản khỏi pool" : "Không tìm thấy key để xóa",
        totalKeys: updatedKeys.length,
        availableKeys: updatedKeys.filter((k) => k.isAvailable).length,
        keys: updatedKeys,
      });
    }

    if (action === "reset") {
      keyManager.resetAllCooldowns();
      const updatedKeys = keyManager.getAllKeysStatus();

      return NextResponse.json({
        success: true,
        message: "Đã xóa trạng thái tạm khóa (cooldown) của tất cả tài khoản",
        totalKeys: updatedKeys.length,
        availableKeys: updatedKeys.filter((k) => k.isAvailable).length,
        keys: updatedKeys,
      });
    }

    return NextResponse.json({ error: `Hành động không xác định: ${action}` }, { status: 400 });
  } catch (err) {
    console.error("Could not process AI key request:", err);
    return NextResponse.json({ error: "Không thể xử lý yêu cầu tài khoản AI." }, { status: 500 });
  }
}
