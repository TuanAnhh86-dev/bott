import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("human_approvals")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.warn("[HumanReview] DB fetch warning:", error);
      return NextResponse.json({ success: true, reviews: [] });
    }

    return NextResponse.json({ success: true, reviews: data || [] });
  } catch (error: unknown) {
    console.error("[API Human Review GET Error]:", error);
    return NextResponse.json({ error: "Lỗi tải danh sách phê duyệt." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const originError = validateSameOriginJsonRequest(req);
  if (originError) return originError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { reviewId, action, note } = body;

    if (!reviewId || !action) {
      return NextResponse.json({ error: "Thiếu mã phê duyệt hoặc hành động." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("human_approvals")
      .update({
        status: action === "approve" ? "APPROVED" : "REJECTED",
        resolution_note: note || (action === "approve" ? "Người dùng đã can thiệp và phê duyệt tiếp tục." : "Người dùng từ chối."),
        resolved_at: new Date().toISOString(),
      })
      .eq("id", reviewId)
      .select()
      .maybeSingle();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, review: data });
  } catch (error: unknown) {
    console.error("[API Human Review POST Error]:", error);
    return NextResponse.json({ error: "Không thể cập nhật trạng thái phê duyệt." }, { status: 500 });
  }
}

