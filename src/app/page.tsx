"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Clock, 
  Send, 
  Layers, 
  ShieldCheck, 
  Camera,
  Video,
  Package,
  Users,
  Share2,
  ArrowUpRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { formatVND } from "@/lib/utils";

interface KPIData {
  year: number;
  month: number;
  targetVnd: number;
  achievedNetVnd: number;
  remainingVnd: number;
  completionPct: number;
  dailyTargetVnd: number;
  daysRemaining: number;
  status: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const QUICK_PROMPTS = [
  "📈 Chi tiết tiến độ KPI 5 triệu",
  "📸 Em Mì bán ảnh Stock ở sàn nào?",
  "💡 Mô hình tạo doanh thu tự chủ ra sao?",
  "🛡️ Nguyên tắc an toàn dữ liệu"
];

const BUSINESS_MODELS = [
  {
    icon: Camera,
    title: "Stock Media (Ảnh & Video)",
    platforms: ["Adobe Stock", "Shutterstock", "Alamy"],
    status: "Đang nghiên cứu & tối ưu metadata",
    desc: "Sản xuất và phân phối ảnh thương mại bản quyền trên các sàn quốc tế.",
    tagColor: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
  },
  {
    icon: Video,
    title: "UGC & Brand Campaigns",
    platforms: ["Billo", "JoinBrands", "Trend"],
    status: "Soạn kịch bản & báo giá brief",
    desc: "Tạo kịch bản nội dung sáng tạo, báo giá chiến dịch và bàn giao deliverables.",
    tagColor: "border-blue-500/30 text-blue-400 bg-blue-500/10"
  },
  {
    icon: Package,
    title: "Digital Products & Templates",
    platforms: ["Gumroad", "Payhip", "Stan Store"],
    status: "Đóng gói tài nguyên số",
    desc: "Ebook, prompts, preset đồ hoạ, template thiết kế bán tự động 24/7.",
    tagColor: "border-purple-500/30 text-purple-400 bg-purple-500/10"
  },
  {
    icon: Users,
    title: "Subscription & Premium PPV",
    platforms: ["Fanvue", "Patreon", "Fansly"],
    status: "Thiết lập gói hội viên",
    desc: "Xây dựng tệp người theo dõi trung thành và phân phối nội dung đặc quyền.",
    tagColor: "border-amber-500/30 text-amber-400 bg-amber-500/10"
  },
  {
    icon: Share2,
    title: "Content Clipping & Affiliate",
    platforms: ["Shorts", "Reels", "TikTok"],
    status: "Phân phối link tiếp thị",
    desc: "Cắt ghép video ngắn bắt trend, đính kèm link affiliate tăng tỷ lệ chuyển đổi.",
    tagColor: "border-teal-500/30 text-teal-400 bg-teal-500/10"
  }
];

export default function PublicDashboardPage() {
  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [kpiError, setKpiError] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: "Xin chào! Mình là **EM MÌ** — trợ lý AI hỗ trợ lập kế hoạch kinh doanh số.\n\nMục tiêu mặc định là **5,000,000 ₫/tháng**. Mình có thể hỗ trợ nghiên cứu, soạn thảo và theo dõi KPI; các nền tảng bên dưới chưa được xác nhận là đã tích hợp.\n\nBạn có thể chọn câu hỏi gợi ý hoặc hỏi về các tính năng hiện có.",
    },
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const assistantResponseRef = useRef("");

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch live KPI
  useEffect(() => {
    fetch("/api/kpi/status")
      .then((res) => {
        if (!res.ok) throw new Error("KPI request failed.");
        return res.json();
      })
      .then((data) => {
        if (data && !data.error) setKpi(data);
        else setKpiError(true);
      })
      .catch((err) => {
        console.error("Lỗi lấy dữ liệu KPI:", err);
        setKpiError(true);
      });
  }, []);

  const sendQuery = async (queryText: string) => {
    if (!queryText.trim() || isSending) return;

    const userText = queryText.trim();
    setInputMessage("");

    const newMessages: ChatMessage[] = [
      ...messages,
      { id: crypto.randomUUID(), role: "user", content: userText },
    ];
    setMessages(newMessages);
    setIsSending(true);

    try {
      const response = await fetch("/api/chat/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Lỗi khi kết nối với AI stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      assistantResponseRef.current = "";
      const assistantMessageId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: "assistant", content: "" },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        assistantResponseRef.current += chunk;

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: assistantResponseRef.current }
              : msg
          )
        );
      }

      if (!assistantResponseRef.current.trim()) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  content:
                    "⚠️ [Thông báo Em Mì]: Hệ thống đang bận hoặc hạn mức tạm thời bị gián đoạn. Bạn vui lòng thử lại sau giây lát hoặc liên hệ Quản trị viên để cập nhật API key nhé!",
                }
              : msg
          )
        );
      }
    } catch (err: unknown) {
      console.error("Lỗi gửi tin nhắn:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "⚠️ Rất tiếc, đã có lỗi kết nối tạm thời. Bạn vui lòng thử lại sau giây lát nhé!",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuery(inputMessage);
  };

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 antialiased selection:bg-emerald-500 selection:text-white">
      {/* Top Header Navbar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-[#090a0f]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-white shadow-lg shadow-emerald-500/25 tracking-tighter text-base">
              MÌ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight text-white">EM MÌ</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  Business Assistant
                </span>
              </div>
              <p className="text-xs text-slate-400">AI Creator Business Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900/80 border border-zinc-800 text-xs text-slate-300">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <strong className="text-emerald-400">Hỗ trợ lập kế hoạch</strong>
            </div>

            <a href="/admin">
              <Button 
                variant="outline" 
                size="sm" 
                className="text-xs font-semibold border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-slate-200 hover:text-white"
              >
                Admin Portal <ArrowUpRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* KPI Hero Banner */}
        <section className="relative overflow-hidden rounded-2xl border border-zinc-800/90 bg-gradient-to-br from-zinc-900/90 via-[#0d1117] to-[#090a0f] p-6 sm:p-8 glow-card">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

          {kpi ? (
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left 7 cols: Target details */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="default" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs px-2.5 py-0.5">
                  KPI Tháng {kpi.month}/{kpi.year}
                </Badge>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" /> Còn {kpi.daysRemaining} ngày trong kỳ
                </span>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-1">Doanh Thu Đã Xác Minh (Verified)</p>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white font-mono">
                    {formatVND(kpi.achievedNetVnd)}
                  </h1>
                  <span className="text-slate-400 text-lg sm:text-xl font-normal">
                    / mục tiêu <strong className="text-slate-200">{formatVND(kpi.targetVnd)}</strong>
                  </span>
                </div>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                Doanh thu chỉ được tính từ khoản đã xác minh. Các mô hình bên dưới là lựa chọn tham khảo, không đồng nghĩa đã có tích hợp hoặc đang vận hành.
              </p>

              {/* Progress Bar & Milestones */}
              <div className="pt-2 space-y-2">
                <div className="flex justify-between text-xs text-slate-300 font-medium">
                  <span>Tiến độ thực tế: <strong className="text-emerald-400 font-mono text-sm">{kpi.completionPct}%</strong></span>
                  <span>Còn thiếu: <strong className="text-slate-100 font-mono">{formatVND(kpi.remainingVnd)}</strong></span>
                </div>
                <div className="relative">
                  <Progress value={Math.min(100, kpi.completionPct)} className="h-3.5 bg-zinc-800" />
                </div>
              </div>
            </div>

            {/* Right 5 cols: 4 Stat Pills */}
            <div className="lg:col-span-5 grid grid-cols-2 gap-3.5">
              <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cần Đạt / Ngày</span>
                <p className="text-lg font-bold text-white font-mono">{formatVND(kpi.dailyTargetVnd)}</p>
                <p className="text-[11px] text-slate-400">Để hoàn thành đúng hạn</p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Trạng Thái Nhịp</span>
                <p className="text-lg font-bold text-emerald-400">
                  {kpi.status === "ahead" ? "⚡ Vượt tiến độ" : kpi.status === "on_track" ? "🎯 Đúng tiến độ" : "⚠️ Cần tăng tốc"}
                </p>
                <p className="text-[11px] text-slate-400">Pace engine tự động</p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Mô Hình Tham Khảo</span>
                <p className="text-lg font-bold text-white">5 lựa chọn</p>
                <p className="text-[11px] text-slate-400">Chưa khẳng định tích hợp</p>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 hover:border-zinc-700/80 transition-colors space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Cổng An Toàn</span>
                <p className="text-lg font-bold text-emerald-400">Có kiểm soát</p>
                <p className="text-[11px] text-slate-400">Hành động nhạy cảm cần duyệt</p>
              </div>
            </div>
          </div>
          ) : (
            <p className="relative z-10 py-8 text-sm text-slate-400" role="status">
              {kpiError ? "Chưa thể tải KPI đã xác minh." : "Đang tải KPI đã xác minh..."}
            </p>
          )}
        </section>

        {/* 2-Column: Business Channels & Realtime Chat */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (5 cols): Business Models & Guardrails */}
          <div className="lg:col-span-5 space-y-6">
            <Card className="bg-zinc-900/70 border-zinc-800/80 glow-card">
              <CardHeader className="pb-3 border-b border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-400" />
                    Hệ Thống Mô Hình Kinh Doanh
                  </CardTitle>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800 text-slate-300">
                    5 Mô hình
                  </span>
                </div>
                <CardDescription className="text-slate-400 text-xs">
                  Mô hình tham khảo. Tên nền tảng bên dưới không xác nhận đã kết nối tài khoản hay API.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                {BUSINESS_MODELS.map((item, idx) => {
                  const IconComp = item.icon;
                  return (
                    <div 
                      key={idx} 
                      className="p-3.5 rounded-xl bg-[#0c0d14] border border-zinc-800/80 hover:border-zinc-700 transition-all space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-zinc-800/80 flex items-center justify-center text-slate-200">
                            <IconComp className="h-4 w-4 text-emerald-400" />
                          </div>
                          <span className="font-semibold text-sm text-slate-200">{item.title}</span>
                        </div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${item.tagColor}`}>
                          Chưa tích hợp
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 pl-9.5">{item.desc}</p>
                      <div className="flex items-center gap-1.5 pl-9.5 pt-1">
                        {item.platforms.map((plat, pIdx) => (
                          <span key={pIdx} className="text-[10px] font-mono text-slate-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                            {plat}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Guardrails Card */}
            <Card className="bg-zinc-900/70 border-zinc-800/80 glow-card">
              <CardHeader className="pb-3 border-b border-zinc-800/80">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  Quy Tắc Phân Quyền & Bảo Mật
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-400 space-y-2.5 p-4 leading-relaxed">
                <div className="flex gap-2.5">
                  <span className="text-emerald-400 font-bold shrink-0">● AUTO_EXECUTE:</span>
                  <span>Tự động nghiên cứu web, tạo bản thảo nội dung và phân tích từ khóa.</span>
                </div>
                <div className="flex gap-2.5">
                  <span className="text-amber-400 font-bold shrink-0">● REQUIRE_APPROVAL:</span>
                  <span>Hợp đồng đối tác, rút tiền hoặc chạy quảng cáo trả phí bắt buộc phải được Admin phê duyệt.</span>
                </div>
                <div className="flex gap-2.5">
                  <span className="text-red-400 font-bold shrink-0">● EMERGENCY STOP:</span>
                  <span>Công tắc dừng toàn cục ngăn các tác vụ mới; tác vụ đang chạy cần kết thúc hoặc hết thời gian chờ.</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column (7 cols): Public Realtime Chat */}
          <div className="lg:col-span-7">
            <Card className="h-[680px] flex flex-col bg-zinc-900/70 border-zinc-800/80 glow-card">
              <CardHeader className="pb-3 border-b border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-ping"></div>
                    <div>
                      <CardTitle className="text-base font-bold text-white">Trò Chuyện Với Em Mì</CardTitle>
                      <CardDescription className="text-xs text-slate-400">
                        Streaming AI Response • Tối ưu 85% chi phí token qua Prompt Caching
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[11px] bg-zinc-800 text-slate-300 font-mono">
                    Public Room
                  </Badge>
                </div>
              </CardHeader>

              {/* Message List */}
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {m.role === "assistant" && (
                      <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-xs font-black text-white shadow-md shadow-emerald-500/20 shrink-0">
                        MÌ
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-emerald-600 text-white rounded-br-none shadow-md shadow-emerald-600/20 font-medium"
                          : "bg-[#0d1017] text-slate-200 border border-zinc-800/90 rounded-bl-none whitespace-pre-wrap font-normal"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
                {isSending && (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 pl-11">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce"></span>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.2s]"></span>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-bounce [animation-delay:0.4s]"></span>
                    <span>Em Mì đang suy nghĩ và phản hồi...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </CardContent>

              {/* Quick Prompt Chips */}
              <div className="px-4 py-2 border-t border-zinc-800/60 bg-[#0a0c12]/60 flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-[11px] text-slate-400 font-semibold shrink-0">Gợi ý:</span>
                {QUICK_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendQuery(prompt)}
                    disabled={isSending}
                    className="text-[11px] text-slate-300 hover:text-white px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-emerald-600/20 hover:border-emerald-500/40 border border-zinc-700/60 transition-all shrink-0 cursor-pointer"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Chat Input Form */}
              <div className="p-3 border-t border-zinc-800 bg-[#090a0f]">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Hỏi Em Mì về mô hình kinh doanh hoặc công nghệ AI..."
                    className="bg-[#0f111a] border-zinc-800 focus-visible:ring-emerald-500 text-sm text-slate-100 placeholder:text-slate-500 h-10"
                    disabled={isSending}
                  />
                  <Button 
                    type="submit" 
                    disabled={isSending || !inputMessage.trim()} 
                    className="shrink-0 h-10 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md shadow-emerald-600/25 cursor-pointer"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
