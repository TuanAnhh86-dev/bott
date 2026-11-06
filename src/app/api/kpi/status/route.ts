import { NextResponse } from "next/server";
import { KPIService } from "@/features/kpi/service";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";

export async function GET(request: Request) {
  if (!checkRateLimit(`public-kpi:${getClientAddress(request)}`, { perMinute: 30, perHour: 300 })) {
    return NextResponse.json(
      { error: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
      { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } }
    );
  }

  try {
    const kpi = await KPIService.getMonthlyStatus();
    return NextResponse.json(kpi, { headers: { "Cache-Control": "no-store" } });
  } catch (err: unknown) {
    console.error("[Public KPI] Could not load the approved monthly aggregate:", err);
    return NextResponse.json(
      { error: "Không thể truy xuất trạng thái KPI." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
