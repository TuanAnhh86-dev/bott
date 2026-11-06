import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const { error } = await createAdminClient()
      .from("app_settings")
      .select("key")
      .eq("key", "agent.emergency_stop")
      .limit(1);

    if (error) throw error;

    return NextResponse.json(
      { status: "ok", checks: { database: "reachable" } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", checks: { database: "unavailable" } },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
