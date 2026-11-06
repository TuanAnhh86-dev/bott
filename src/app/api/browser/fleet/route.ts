import { NextResponse } from "next/server";
import { SupervisorAgent } from "@/features/browser/agents";
import { requireAdminApi } from "@/lib/security/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const bots = SupervisorAgent.getFleetStatus();
    const metrics = {
      totalBots: bots.length,
      onlineBots: bots.filter((b) => b.isHealthy).length,
      busyBots: bots.filter((b) => b.status === "BUSY").length,
      idleBots: bots.filter((b) => b.status === "IDLE").length,
    };

    return NextResponse.json({
      success: true,
      bots,
      metrics,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.error("[Fleet API] Error:", err);
    return NextResponse.json({ error: "Không thể lấy thông tin bot fleet." }, { status: 500 });
  }
}
