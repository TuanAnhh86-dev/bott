"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { 
  Bot, 
  Send, 
  X, 
  RefreshCw, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

interface BeBoDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskTriggered?: () => void;
}

const QUICK_ACTIONS = [
  "Bé Bơ báo cáo trạng thái hạm đội bot",
  "Khởi chạy khảo sát TimeBucks",
  "Kiểm tra chốt chặn an toàn và Captcha",
  "Tóm tắt tiến độ KPI 5.000.000đ",
];

export function BeBoDrawer({ isOpen, onClose, onTaskTriggered }: BeBoDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/admin");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.messages) && data.messages.length > 0) {
          setMessages(
            data.messages.map((m: { id: string; role: "user" | "assistant"; content: string; createdAt?: string }) => ({
              id: m.id,
              role: m.role,
              content: m.content,
              createdAt: m.createdAt,
            }))
          );
        } else {
          setMessages([
            {
              id: "init_1",
              role: "assistant",
              content: "Dạ em Bơ chào Bác! Em đã kết nối trực tiếp với Hạm Đội Bot Trình Duyệt và Hệ Thống Điều Hành. Bác có thể gửi link nhiệm vụ, yêu cầu cày khảo sát, hoặc chỉ thị quản trị ngay tại đây ạ! 🌸",
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      }
    } catch {
      // Offline fallback
      setMessages((prev) =>
        prev.length > 0
          ? prev
          : [
              {
                id: "init_fallback",
                role: "assistant",
                content: "Dạ em Bơ chào Bác! Em đang sẵn sàng hỗ trợ điều phối hạm đội bot và xử lý nhiệm vụ kiếm tiền. Bác cần em làm gì ạ?",
                createdAt: new Date().toISOString(),
              },
            ]
      );
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const content = (textToSend || input).trim();
    if (!content || isLoading) return;

    setErrorMessage(null);
    setInput("");

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };

    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMsgs.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Lỗi máy chủ (${res.status})`);
      }

      // Check if it's a stream
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") || contentType.includes("text/plain")) {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let assistantContent = "";
        const botMsgId = `bot_${Date.now()}`;

        setMessages((prev) => [
          ...prev,
          { id: botMsgId, role: "assistant", content: "", createdAt: new Date().toISOString() },
        ]);

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            assistantContent += chunk;

            setMessages((prev) =>
              prev.map((msg) => (msg.id === botMsgId ? { ...msg, content: assistantContent } : msg))
            );
          }
        }
      } else {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: `bot_${Date.now()}`,
            role: "assistant",
            content: data.reply || data.content || "Dạ em đã ghi nhận chỉ thị của Bác!",
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      if (onTaskTriggered) {
        onTaskTriggered();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Không thể kết nối máy chủ";
      setErrorMessage(`Không thể gửi tin nhắn: ${msg}. Bác vui lòng kiểm tra server nhé.`);
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: `⚠️ Dạ em tạm thời gián đoạn kết nối tới AI Model (${msg}). Bác có thể thử lại hoặc dùng các nút điều khiển trực tiếp trên màn hình nhé!`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-xs">
            BƠ
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              Bé Bơ Co-Pilot
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] py-0 px-1.5">
                Admin
              </Badge>
            </h3>
            <p className="text-[11px] text-emerald-400 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Đồng bộ trực tiếp với Hạm Đội
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchHistory}
            className="text-slate-400 hover:text-white h-8 w-8 p-0"
            title="Tải lại lịch sử chat"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-slate-400 hover:text-white h-8 w-8 p-0"
            title="Đóng khung chat"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.map((m) => {
          const isUser = m.role === "user";

          return (
            <div
              key={m.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <span className="text-[10px] text-slate-500 font-medium">
                  {isUser ? "Bác (Admin)" : "Bé Bơ"}
                </span>
                {m.createdAt && (
                  <span className="text-[9px] text-slate-600">
                    {new Date(m.createdAt).toLocaleTimeString("vi-VN")}
                  </span>
                )}
              </div>

              <div
                className={`max-w-[88%] rounded-2xl p-3 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                  isUser
                    ? "bg-emerald-600 text-white rounded-tr-xs"
                    : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-xs shadow-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-xs p-3 text-xs text-slate-400 flex items-center gap-2">
              <div className="h-3.5 w-3.5 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
              <span>Bé Bơ đang suy nghĩ và điều phối bot...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips */}
      <div className="px-3 py-2 bg-slate-900/50 border-t border-slate-800/80 overflow-x-auto flex gap-1.5 no-scrollbar">
        {QUICK_ACTIONS.map((action, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(action)}
            className="text-[10px] bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white px-2.5 py-1 rounded-full whitespace-nowrap transition-colors border border-slate-700/60"
          >
            {action}
          </button>
        ))}
      </div>

      {/* Input Form */}
      <div className="p-3 border-t border-slate-800 bg-slate-900/90">
        {errorMessage && (
          <p className="text-[11px] text-rose-400 mb-2 truncate">{errorMessage}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Nhập chỉ thị cho Bé Bơ hoặc gửi link..."
            disabled={isLoading}
            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 px-3 text-xs shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}

