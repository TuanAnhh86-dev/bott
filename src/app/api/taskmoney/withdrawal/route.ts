import { NextRequest, NextResponse } from "next/server";
import { TaskMoneyFinance } from "@/features/taskmoney/finance";
import { LogicalBalance, WithdrawalRequest } from "@/features/taskmoney/types";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guardError = validateSameOriginJsonRequest(req);
  if (guardError) return guardError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  if (!checkRateLimit(`taskmoney-withdrawal:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 15, perHour: 60 })) {
    return NextResponse.json({ error: "Quá nhiều yêu cầu rút tiền. Vui lòng thử lại sau." }, { status: 429 });
  }

  const bodyResult = await readJsonBody(req);
  if (!bodyResult.success) return bodyResult.response;

  const raw = (bodyResult.data || {}) as Record<string, unknown>;
  const action = raw.action as string;

  try {
    if (action === "create_draft") {
      const balance = raw.balance as LogicalBalance;
      const destinationType = (raw.destinationType as "paypal" | "bank_transfer" | "crypto_usdt") || "paypal";
      const destinationAccount = String(raw.destinationAccount || "").trim();
      const amountVnd = Number(raw.amountVnd) || 0;

      if (!balance || !destinationAccount || amountVnd <= 0) {
        return NextResponse.json({ error: "Tham số rút tiền không hợp lệ." }, { status: 400 });
      }

      const draft = await TaskMoneyFinance.createWithdrawalDraft(balance, {
        balanceId: balance.id,
        siteId: balance.siteId,
        accountId: balance.accountId,
        destinationType,
        destinationAccount,
        amountVnd,
      });

      return NextResponse.json({
        success: true,
        draft,
        message: "Đã tạo phiếu đề xuất rút tiền. Yêu cầu Người dùng ký duyệt để tiếp tục.",
      });
    }

    if (action === "approve") {
      const request = raw.request as WithdrawalRequest;
      const rawDestination = String(raw.rawDestination || "").trim();

      if (!request || !rawDestination) {
        return NextResponse.json({ error: "Thiếu dữ liệu xác thực phiếu rút tiền." }, { status: 400 });
      }

      const approval = await TaskMoneyFinance.approveWithdrawal(request, rawDestination, auth.identity.id);
      if (!approval.approved) {
        return NextResponse.json({ error: approval.error }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: "Phiếu rút tiền đã được Người dùng phê duyệt thành công với chữ ký SHA-256 hợp lệ.",
      });
    }

    return NextResponse.json({ error: "Hành động không được hỗ trợ." }, { status: 400 });
  } catch (err: unknown) {
    console.error("[TaskMoneyWithdrawal] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Lỗi xử lý yêu cầu rút tiền." },
      { status: 500 }
    );
  }
}

