import { NextRequest, NextResponse } from "next/server";
import { createResilientTextStream } from "@/lib/ai/client";
import { ModelRouter } from "@/lib/ai/router";
import { EMMI_ADMIN_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { createAdminClient } from "@/lib/supabase/admin";
import { KPIService } from "@/features/kpi/service";
import { requireAdminApi } from "@/lib/security/admin-auth";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";
import { parseChatMessages } from "@/lib/security/chat-validation";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { recordBridgeMessage, getRecentBridgeMessages } from "@/lib/bridge/inbox";
import { workerPool } from "@/features/agent/worker-pool";
import { TaskStore } from "@/features/agent/task-store";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    const supabase = createAdminClient();
    const primarySession = `admin_primary_chat_${auth.identity.id}`;

    // 1. Try to load from Supabase messages table
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("session_id", primarySession)
      .eq("type", "admin")
      .maybeSingle();

    if (conv?.id) {
      const { data: dbMsgs } = await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: true })
        .limit(100);

      if (dbMsgs && dbMsgs.length > 0) {
        return NextResponse.json({
          success: true,
          messages: dbMsgs.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.created_at,
          })),
        });
      }
    }

    // 2. Fallback to bridge_inbox.json
    const recentBridge = getRecentBridgeMessages(50);
    if (recentBridge.length > 0) {
      return NextResponse.json({
        success: true,
        messages: recentBridge.map((m) => ({
          id: m.id,
          role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
          content: m.content,
          createdAt: m.timestamp,
        })),
      });
    }

    return NextResponse.json({ success: true, messages: [] });
  } catch (error) {
    console.error("Lỗi lấy lịch sử chat admin:", error);
    const recentBridge = getRecentBridgeMessages(50);
    return NextResponse.json({
      success: true,
      messages: recentBridge.map((m) => ({
        id: m.id,
        role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
        content: m.content,
        createdAt: m.timestamp,
      })),
    });
  }
}

export async function POST(req: NextRequest) {
  const requestError = validateSameOriginJsonRequest(req);
  if (requestError) return requestError;

  const auth = await requireAdminApi();
  if (auth.response) return auth.response;

  try {
    if (!checkRateLimit(`admin-chat:${auth.identity.id}:${getClientAddress(req)}`, { perMinute: 60, perHour: 600 })) {
      return NextResponse.json(
        { error: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau giây lát." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const bodyResult = await readJsonBody(req, 128 * 1024);
    if (!bodyResult.success) return bodyResult.response;
    const messages = parseChatMessages(bodyResult.data);
    if (!messages) return NextResponse.json({ error: "Danh sách tin nhắn không hợp lệ hoặc quá dài." }, { status: 400 });

    const lastMessage = messages[messages.length - 1];
    const userContent = lastMessage.content;

    // Bridge user message to local workspace sync
    recordBridgeMessage({ sender: "user", content: userContent });

    // Autonomous task trigger: If user requests action / provides links / says "chạy", "tự làm", "bắt đầu"
    const lowerContent = userContent.toLowerCase();
    const hasUrls = /(https?:\/\/[^\s]+)/g.test(userContent);
    const isActionCommand =
      hasUrls ||
      lowerContent.includes("chạy") ||
      lowerContent.includes("làm") ||
      lowerContent.includes("bắt đầu") ||
      lowerContent.includes("nhiệm vụ") ||
      lowerContent.includes("timebucks") ||
      lowerContent.includes("quét");

    if (isActionCommand) {
      // Trigger background worker execution asynchronously without blocking the chat stream
      setTimeout(async () => {
        try {
          const pendingCount = (await TaskStore.getPendingTasks(1)).length;
          if (pendingCount > 0) {
            await workerPool.runParallelBatch(2);
          }
        } catch (poolErr) {
          console.warn("[AdminChat] Auto-dispatch worker warning:", poolErr);
        }
      }, 500);
    }

    // 1. Fetch current KPI status to inject into Admin context
    let kpiContext = "";
    try {
      const kpi = await KPIService.getMonthlyStatus();
      kpiContext = `\n[TÌNH HÌNH DOANH THU & KPI HIỆN TẠI]:\n- Tháng: ${kpi.month}/${kpi.year}\n- Mục tiêu: ${kpi.targetVnd.toLocaleString("vi-VN")} ₫\n- Đạt được: ${kpi.achievedNetVnd.toLocaleString("vi-VN")} ₫ (${kpi.completionPct}%)\n- Còn lại: ${kpi.remainingVnd.toLocaleString("vi-VN")} ₫\n- Trạng thái: ${kpi.status}`;
    } catch (kpiErr) {
      console.warn("Chưa lấy được KPI context:", kpiErr);
    }

    // 2. Model routing
    const decision = ModelRouter.route(userContent, "admin");

    // 3. Stream AI response with resilient account rotation & model fallback
    const targetSession = `admin_primary_chat_${auth.identity.id}`;

    const stream = createResilientTextStream({
      targetModel: decision.modelName,
      system: `${EMMI_ADMIN_SYSTEM_PROMPT}\n${kpiContext}`,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: decision.temperature,
      maxOutputTokens: decision.maxTokens,
      onFinish: async (event) => {
        try {
          const supabase = createAdminClient();

          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id, message_count")
            .eq("session_id", targetSession)
            .eq("type", "admin")
            .maybeSingle();

          let conversationId = existingConv?.id;

          if (!existingConv) {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({
                session_id: targetSession,
                type: "admin",
                user_id: auth.identity.id,
                title: userContent.slice(0, 50),
                message_count: 2,
              })
              .select("id")
              .single();
            conversationId = newConv?.id;
          } else {
            await supabase
              .from("conversations")
              .update({
                message_count: (existingConv.message_count || 0) + 2,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingConv.id);
          }

          if (conversationId && event.text) {
            await supabase.from("messages").insert({
              conversation_id: conversationId,
              role: "user",
              content: userContent,
            });

            await supabase.from("messages").insert({
              conversation_id: conversationId,
              role: "assistant",
              content: event.text,
              model_used: decision.modelName,
            });

            // Bridge Bé Bơ's response to local workspace sync
            recordBridgeMessage({ sender: "be_bo", content: event.text });
          }
        } catch (dbErr) {
          console.error("Lỗi lưu trữ tin nhắn admin:", dbErr);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("Lỗi xử lý Admin Chat API:", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi xử lý tin nhắn." },
      { status: 500 }
    );
  }
}
