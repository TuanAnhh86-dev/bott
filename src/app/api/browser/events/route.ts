import { NextResponse } from "next/server";
import { getRecentLiveEvents } from "@/features/browser/events-bus";
import { requireAdminApi } from "@/lib/security/admin-auth";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const events = getRecentLiveEvents(50);
    return NextResponse.json({
      success: true,
      events,
      total: events.length,
    });
  } catch (error: unknown) {
    console.error("[API Browser Events Error]:", error);
    return NextResponse.json({ error: "Lỗi tải dòng sự kiện trực tiếp." }, { status: 500 });
  }
}
