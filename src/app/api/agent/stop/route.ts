import { NextRequest, NextResponse } from "next/server";
import { isEmergencyStopActive, setEmergencyStop } from "@/lib/security/emergency";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { z } from "zod";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const active = await isEmergencyStopActive();
    return NextResponse.json({ emergencyStopActive: active });
  } catch {
    return NextResponse.json({ error: "Không thể xác minh Emergency Stop." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const requestError = validateSameOriginJsonRequest(req);
  if (requestError) return requestError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    if (!checkRateLimit(`admin-emergency-stop:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 5, perHour: 30 })) {
      return NextResponse.json({ error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." }, { status: 429, headers: { "Retry-After": "60" } });
    }

    const bodyResult = await readJsonBody(req);
    if (!bodyResult.success) return bodyResult.response;
    const parsed = z.object({
      active: z.boolean(),
    }).strict().safeParse(bodyResult.data);
    if (!parsed.success) return NextResponse.json({ error: "Tham số Emergency Stop không hợp lệ." }, { status: 400 });

    const { active } = parsed.data;
    if (!active && auth.identity.role !== "super_admin") {
      return NextResponse.json({ error: "Chỉ super_admin được tắt Emergency Stop." }, { status: 403 });
    }
    const success = await setEmergencyStop(active, auth.identity.id);
    if (!success) {
      return NextResponse.json({ error: "Không thể ghi nhận trạng thái Emergency Stop." }, { status: 503 });
    }

    return NextResponse.json({
      success,
      emergencyStopActive: active,
      message: active
        ? "Đã KÍCH HOẠT Dừng Khẩn Cấp (Emergency Stop). Mọi tác vụ tự động đã tạm dừng!"
        : "Đã TẮT Dừng Khẩn Cấp. Hệ thống sẵn sàng tiếp tục hoạt động.",
    });
  } catch (err: unknown) {
    console.error("Lỗi API Emergency Stop:", err);
    return NextResponse.json(
      { error: "Không thể cập nhật Emergency Stop." },
      { status: 500 }
    );
  }
}
