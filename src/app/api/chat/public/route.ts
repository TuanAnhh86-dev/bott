import { NextRequest, NextResponse } from "next/server";
import { createResilientTextStream } from "@/lib/ai/client";
import { ModelRouter } from "@/lib/ai/router";
import { EMMI_PUBLIC_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientAddress, checkRateLimit } from "@/lib/security/rate-limit";
import { parseChatMessages } from "@/lib/security/chat-validation";
import { readJsonBody, validateSameOriginJsonRequest } from "@/lib/security/request-guards";
import { randomUUID } from "node:crypto";

export async function POST(req: NextRequest) {
  try {
    const requestError = validateSameOriginJsonRequest(req);
    if (requestError) return requestError;

    const clientAddress = getClientAddress(req);
    if (!checkRateLimit(`public-chat:${clientAddress}`, { perMinute: 10, perHour: 60 })) {
      return NextResponse.json(
        { error: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }

    const bodyResult = await readJsonBody(req, 128 * 1024);
    if (!bodyResult.success) return bodyResult.response;
    const messages = parseChatMessages(bodyResult.data);
    if (!messages) return NextResponse.json({ error: "Danh sách tin nhắn không hợp lệ hoặc quá dài." }, { status: 400 });

    const lastMessage = messages[messages.length - 1];
    const userContent = lastMessage.content;

    // 1. Model routing
    const decision = ModelRouter.route(userContent, "public");

    // 2. Stream AI response with resilient account rotation & model fallback
    const stream = createResilientTextStream({
      targetModel: decision.modelName,
      system: EMMI_PUBLIC_SYSTEM_PROMPT,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: decision.temperature,
      maxOutputTokens: decision.maxTokens,
      onFinish: async (event) => {
        try {
          const supabase = createAdminClient();
          const targetSession = `anon_${randomUUID()}`;

          // Get or create conversation
          const { data: existingConv } = await supabase
            .from("conversations")
            .select("id, message_count")
            .eq("session_id", targetSession)
            .eq("type", "public")
            .maybeSingle();

          let conversationId = existingConv?.id;

          if (!existingConv) {
            const { data: newConv } = await supabase
              .from("conversations")
              .insert({
                session_id: targetSession,
                type: "public",
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
          }
        } catch (dbErr) {
          console.error("Lỗi lưu trữ tin nhắn công khai:", dbErr);
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
    console.error("Lỗi xử lý Public Chat API:", error);
    return NextResponse.json(
      { error: "Lỗi máy chủ khi xử lý tin nhắn." },
      { status: 500 }
    );
  }
}
