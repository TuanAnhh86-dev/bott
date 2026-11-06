import { NextRequest, NextResponse } from "next/server";
import { SupervisorAgent } from "@/features/browser/agents";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { validateSameOriginJsonRequest } from "@/lib/security/request-guards";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const bots = SupervisorAgent.getFleetStatus();
    return NextResponse.json({
      success: true,
      bots,
      totalBots: bots.length,
      onlineBots: bots.filter((b) => b.isHealthy).length,
      busyBots: bots.filter((b) => b.status === "BUSY").length,
      idleBots: bots.filter((b) => b.status === "IDLE").length,
    });
  } catch (error: unknown) {
    console.error("[API Browser Bots Error]:", error);
    return NextResponse.json({ error: "Lỗi tải danh sách bot." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const originError = validateSameOriginJsonRequest(req);
  if (originError) return originError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { action, botId } = body;

    if (action === "heartbeat" && botId) {
      SupervisorAgent.recordHeartbeat(botId);
      return NextResponse.json({ success: true, message: `Đã ghi nhận heartbeat cho ${botId}` });
    }

    if (action === "initialize") {
      SupervisorAgent.initializeFleet();
      return NextResponse.json({ success: true, bots: SupervisorAgent.getFleetStatus() });
    }

    return NextResponse.json({ error: "Hành động không hợp lệ." }, { status: 400 });
  } catch (error: unknown) {
    console.error("[API Browser Bots POST Error]:", error);
    return NextResponse.json({ error: "Lỗi xử lý yêu cầu bot." }, { status: 500 });
  }
}

