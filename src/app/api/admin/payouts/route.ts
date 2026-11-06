import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import {
  addPayoutDestination,
  cancelPayoutWithdrawal,
  completePayoutWithdrawal,
  deletePayoutDestination,
  deleteAllPayoutDestinations,
  getPayoutOwnerId,
  getPayoutOverview,
  PayoutError,
  requestPayoutWithdrawal,
} from "@/features/payouts/service";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_destination"),
    provider: z.string().trim().min(1).max(100),
    label: z.string().trim().min(1).max(100),
    recipientName: z.string().trim().min(1).max(120),
    accountReference: z.string().trim().min(4).max(256),
  }).strict(),
  z.object({
    action: z.literal("delete_destination"),
    destinationId: z.string().uuid(),
  }).strict(),
  z.object({
    action: z.literal("delete_all_destinations"),
  }).strict(),
  z.object({
    action: z.literal("request_withdrawal"),
    destinationId: z.string().uuid(),
    amountVnd: z.number().int().positive().max(1_000_000_000_000),
    securityPin: z.string().regex(/^\d{6}$/, "Mã PIN bảo mật phải gồm đúng 6 chữ số"),
    idempotencyKey: z.string().uuid(),
    note: z.string().trim().max(500).optional(),
  }).strict(),
  z.object({
    action: z.literal("complete_withdrawal"),
    withdrawalId: z.string().uuid(),
    evidence: z.string().trim().min(1).max(1_000),
  }).strict(),
  z.object({
    action: z.literal("cancel_withdrawal"),
    withdrawalId: z.string().uuid(),
  }).strict(),
]);

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

function payoutErrorResponse(error: unknown) {
  if (error instanceof PayoutError) {
    return noStoreJson({ error: error.message }, error.status);
  }
  console.error("[Payouts API] Request failed:", error);
  return noStoreJson({ error: "Không thể xử lý thông tin tài chính lúc này." }, 500);
}

async function authorizeOwner() {
  const auth = await requireAdminApi();
  if (auth.response) return { response: auth.response, ownerId: null };

  try {
    const configuredOwnerId = getPayoutOwnerId();
    const isSuperAdmin = auth.identity.role === "super_admin";
    const isDev = process.env.NODE_ENV === "development" && !process.env.VITEST;

    const ownerId =
      auth.identity.id &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(auth.identity.id) &&
      auth.identity.id !== "00000000-0000-0000-0000-000000000001"
        ? auth.identity.id
        : configuredOwnerId;

    if (!isSuperAdmin && auth.identity.id !== configuredOwnerId && !isDev) {
      return {
        response: noStoreJson({ error: "Chỉ chủ sở hữu đã xác minh được truy cập chức năng này." }, 403),
        ownerId: null,
      };
    }
    return { response: null, ownerId };
  } catch (error) {
    return { response: payoutErrorResponse(error), ownerId: null };
  }
}

export async function GET() {
  const authorization = await authorizeOwner();
  if (authorization.response || !authorization.ownerId) {
    return authorization.response ?? noStoreJson({ error: "Không thể xác minh quyền chủ sở hữu." }, 403);
  }

  try {
    return noStoreJson(await getPayoutOverview(authorization.ownerId));
  } catch (error) {
    return payoutErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const requestError = validateSameOriginJsonRequest(request);
  if (requestError) return requestError;

  const authorization = await authorizeOwner();
  if (authorization.response || !authorization.ownerId) {
    return authorization.response ?? noStoreJson({ error: "Không thể xác minh quyền chủ sở hữu." }, 403);
  }

  if (!checkRateLimit(`owner-payouts:${authorization.ownerId}:${getClientAddress(request)}`, { perMinute: 5, perHour: 30 })) {
    return noStoreJson({ error: "Quá nhiều yêu cầu tài chính. Vui lòng thử lại sau." }, 429);
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.success) return bodyResult.response;
  const parsed = requestSchema.safeParse(bodyResult.data);
  if (!parsed.success) {
    return noStoreJson({ error: "Dữ liệu yêu cầu không hợp lệ." }, 400);
  }

  try {
    const { ownerId } = authorization;
    switch (parsed.data.action) {
      case "add_destination":
        return noStoreJson({
          destination: await addPayoutDestination(ownerId, {
            provider: parsed.data.provider,
            label: parsed.data.label,
            recipientName: parsed.data.recipientName,
            accountReference: parsed.data.accountReference,
          }),
        }, 201);
      case "delete_destination":
        return noStoreJson({
          result: await deletePayoutDestination(ownerId, parsed.data.destinationId),
        });
      case "delete_all_destinations":
        return noStoreJson({
          result: await deleteAllPayoutDestinations(ownerId),
        });
      case "request_withdrawal":
        return noStoreJson({
          withdrawal: await requestPayoutWithdrawal({
            ownerId,
            destinationId: parsed.data.destinationId,
            amountVnd: parsed.data.amountVnd,
            securityPin: parsed.data.securityPin,
            idempotencyKey: parsed.data.idempotencyKey,
            note: parsed.data.note,
            ipAddress: getClientAddress(request),
            userAgent: request.headers.get("user-agent") || undefined,
          }),
        }, 201);
      case "complete_withdrawal":
        return noStoreJson({
          withdrawal: await completePayoutWithdrawal(
            ownerId,
            parsed.data.withdrawalId,
            parsed.data.evidence,
            {
              ipAddress: getClientAddress(request),
              userAgent: request.headers.get("user-agent") || undefined,
            }
          ),
        });
      case "cancel_withdrawal":
        return noStoreJson({
          withdrawal: await cancelPayoutWithdrawal(
            ownerId,
            parsed.data.withdrawalId,
            {
              ipAddress: getClientAddress(request),
              userAgent: request.headers.get("user-agent") || undefined,
            }
          ),
        });
    }
  } catch (error) {
    return payoutErrorResponse(error);
  }
}
