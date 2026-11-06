"use client";

import React, { useState, useEffect } from "react";
import { 
  Play, 
  Sparkles, 
  Globe, 
  Cpu, 
  ShieldAlert, 
  ShieldCheck, 
  CheckCircle2, 
  ExternalLink,
  Layers,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { validateTargetUrl } from "@/features/browser/ssrf-guard";

export interface PresetTask {
  id: string;
  badge: string;
  title: string;
  targetUrl: string;
  goal: string;
  instructions: string;
  assignedBotId: string;
  concurrency: number;
  priority: number;
  actionType: string;
}

const PRESET_TASKS: PresetTask[] = [
  {
    id: "timebucks_surveys",
    badge: "TimeBucks Surveys",
    title: "Cày Khảo Sát TimeBucks & Trả Lời Chuẩn Golden Persona",
    targetUrl: "https://timebucks.com/publishers/index.php?pg=earn&tab=all_surveys",
    goal: "Tự động phân tích danh sách khảo sát TimeBucks, áp dụng Golden Persona (Nam 29t, Married, TP.HCM/HN), đối soát thù lao thực tế và chụp ảnh bằng chứng.",
    instructions: "Ưu tiên bài khảo sát có rating >= 4 sao, thời gian thực hiện dưới 15 phút, tránh các câu hỏi bẫy tính nhất quán (Consistency traps), không làm khảo sát yêu cầu cài app lạ.",
    assignedBotId: "bot_browser_1",
    concurrency: 2,
    priority: 95,
    actionType: "SURVEY_RUN",
  },
  {
    id: "sproutgigs_microtasks",
    badge: "SproutGigs / Toloka",
    title: "Vi Nhiệm Vụ SproutGigs & Quét Tiêu Chí Trả Thưởng",
    targetUrl: "https://sproutgigs.com",
    goal: "Quét danh mục micro-tasks khả dụng, kiểm tra yêu cầu nộp proof, lọc nhiệm vụ an toàn có tỷ lệ phê duyệt thù lao > 95%.",
    instructions: "Chỉ chọn nhiệm vụ thuộc danh mục Web visit, SEO search, hoặc Social follow. Dừng lại nếu trang yêu cầu tải file .exe hoặc cung cấp số điện thoại.",
    assignedBotId: "bot_browser_2",
    concurrency: 2,
    priority: 85,
    actionType: "MICRO_TASK",
  },
  {
    id: "tos_audit_new_site",
    badge: "Quét ToS Web Mới",
    title: "Phân Tích ToS & Đánh Giá Rủi Ro Khóa Nick Website Mới",
    targetUrl: "https://freecash.com",
    goal: "Trích xuất sâu điều khoản dịch vụ (ToS), phát hiện quy định cấm automation / bot / multi-account, kiểm tra cổng rút tiền và hạn mức min payout.",
    instructions: "Tìm kiếm các từ khóa: automation, bot, script, multiple accounts, proxy, vpn, ban, withdrawal terms. Báo cáo mức độ rủi ro từ 1 đến 10.",
    assignedBotId: "bot_planner",
    concurrency: 1,
    priority: 90,
    actionType: "TOS_AUDIT",
  },
  {
    id: "custom_web_task",
    badge: "Tùy Biến URL",
    title: "Nhiệm Vụ Duyệt Web Tùy Chỉnh Theo Chỉ Thị",
    targetUrl: "https://",
    goal: "Mở trang web mục tiêu, phân tích cấu trúc DOM, chụp ảnh màn hình xác thực và báo cáo dữ liệu trích xuất.",
    instructions: "Nhập hướng dẫn chi tiết của Bác tại đây...",
    assignedBotId: "bot_orchestrator",
    concurrency: 1,
    priority: 80,
    actionType: "CUSTOM",
  },
];

interface DispatchStudioProps {
  onTaskDispatched?: () => void;
  preselectedBotId?: string | null;
}

export function DispatchStudio({ onTaskDispatched, preselectedBotId }: DispatchStudioProps) {
  const [activePresetId, setActivePresetId] = useState<string>("timebucks_surveys");
  const [title, setTitle] = useState(PRESET_TASKS[0].title);
  const [targetUrl, setTargetUrl] = useState(PRESET_TASKS[0].targetUrl);
  const [goal, setGoal] = useState(PRESET_TASKS[0].goal);
  const [instructions, setInstructions] = useState(PRESET_TASKS[0].instructions);
  const [assignedBotId, setAssignedBotId] = useState(preselectedBotId || PRESET_TASKS[0].assignedBotId);
  const [concurrency, setConcurrency] = useState(PRESET_TASKS[0].concurrency);
  const [priority, setPriority] = useState(PRESET_TASKS[0].priority);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Update form when preselectedBotId changes
  useEffect(() => {
    if (preselectedBotId) {
      setAssignedBotId(preselectedBotId);
    }
  }, [preselectedBotId]);

  // Handle Preset Selection with dynamic data binding
  const handleSelectPreset = (preset: PresetTask) => {
    setActivePresetId(preset.id);
    setTitle(preset.title);
    setTargetUrl(preset.targetUrl);
    setGoal(preset.goal);
    setInstructions(preset.instructions);
    setAssignedBotId(preset.assignedBotId);
    setConcurrency(preset.concurrency);
    setPriority(preset.priority);
    setStatusMessage(null);
  };

  // SSRF check for target URL
  const ssrfCheck = validateTargetUrl(targetUrl);

  const handleLaunchTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!targetUrl || targetUrl === "https://") {
      setStatusMessage({ type: "error", text: "Vui lòng nhập đường dẫn URL mục tiêu hợp lệ." });
      return;
    }

    if (!ssrfCheck.isAllowed) {
      setStatusMessage({
        type: "error",
        text: ssrfCheck.reason || "URL bị chặn bởi lá chắn an toàn (SSRF Guard). Không thể truy cập mạng nội bộ.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const fullGoal = `${title}\n\nMục tiêu: ${goal}\nChỉ thị chi tiết: ${instructions}\nAssignedBot: ${assignedBotId}`;
      const res = await fetch("/api/browser/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: fullGoal,
          targetUrl,
          concurrency,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setStatusMessage({
          type: "success",
          text: `Khởi chạy thành công! Chromium đang tải trang web và ghi nhận bằng chứng. Điểm kiểm định: ${data.report?.verifierScore ?? "Đang xử lý"}/100.`,
        });
        if (onTaskDispatched) {
          setTimeout(onTaskDispatched, 1200);
        }
      } else {
        setStatusMessage({
          type: "error",
          text: data.error || "Không thể phân phối nhiệm vụ tới trình duyệt.",
        });
      }
    } catch {
      setStatusMessage({
        type: "error",
        text: "Lỗi kết nối máy chủ khi khởi chạy trình duyệt.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header explanation */}
      <div className="p-4 bg-slate-900/40 rounded-xl border border-slate-800">
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          Phân Việc & Giao Link Thực Thi Cho Trình Duyệt Playwright
        </h3>
        <p className="text-xs text-slate-400 mt-1">
          Chọn một kịch bản mẫu bên dưới để tự động điền dữ liệu, sau đó Bác có thể tự do tùy biến thông tin, gán Worker và số luồng trước khi nhấn chạy.
        </p>
      </div>

      {/* Preset Cards Selector */}
      <div>
        <label className="text-xs font-semibold text-slate-300 block mb-2 uppercase tracking-wider">
          1. Chọn Kịch Bản Mẫu (Dữ liệu form sẽ tự động thay đổi):
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {PRESET_TASKS.map((preset) => {
            const isSelected = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`text-left p-3.5 rounded-xl border transition-all duration-200 ${
                  isSelected
                    ? "bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500/50"
                    : "bg-slate-900/50 border-slate-800 hover:border-slate-700 hover:bg-slate-900/80"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <Badge className={isSelected ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-slate-800 text-slate-400 border-slate-700"}>
                    {preset.badge}
                  </Badge>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                </div>
                <h4 className="text-xs font-semibold text-white line-clamp-2 leading-relaxed">
                  {preset.title}
                </h4>
                <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">
                  {preset.goal}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive Form */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm font-semibold text-white flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Cpu className="h-4 w-4 text-cyan-400" />
              2. Tinh Chỉnh Dữ Liệu & Cấu Hình Thực Thi
            </span>
            <Badge variant="outline" className="text-xs font-mono text-cyan-300 border-cyan-500/30">
              Đang chỉnh sửa: {activePresetId}
            </Badge>
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Tất cả các trường dưới đây có thể chỉnh sửa tự do trước khi phân phối lệnh cho bot.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleLaunchTask} className="space-y-4">
            {/* Title */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Tiêu đề nhiệm vụ:
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Nhập tiêu đề nhiệm vụ..."
                className="bg-slate-950/80 border-slate-800 text-white text-xs h-9 focus-visible:ring-emerald-500"
                required
              />
            </div>

            {/* Target URL & SSRF Indicator */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-emerald-400" />
                  Đường dẫn (URL) trang web mục tiêu:
                </label>
                {targetUrl && targetUrl !== "https://" && (
                  ssrfCheck.isAllowed ? (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      URL An toàn (SSRF Passed)
                    </span>
                  ) : (
                    <span className="text-[11px] text-rose-400 flex items-center gap-1">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      {ssrfCheck.reason || "URL Không an toàn"}
                    </span>
                  )
                )}
              </div>
              <Input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com"
                className={`bg-slate-950/80 text-white text-xs font-mono h-9 ${
                  !ssrfCheck.isAllowed && targetUrl !== "https://"
                    ? "border-rose-500 focus-visible:ring-rose-500"
                    : "border-slate-800 focus-visible:ring-emerald-500"
                }`}
                required
              />
            </div>

            {/* Goal */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Mục tiêu trọng tâm:
              </label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={2}
                placeholder="Mô tả mục tiêu chính của tác vụ..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-md p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>

            {/* Detailed Instructions */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">
                Chỉ thị chi tiết & Điều kiện an toàn:
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={3}
                placeholder="Nhập các quy tắc phòng thủ, điều kiện dừng, Persona..."
                className="w-full bg-slate-950/80 border border-slate-800 rounded-md p-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            {/* Execution Parameters (Bot, Concurrency, Priority) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-800/80">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Gán Cho Worker Agent:
                </label>
                <select
                  value={assignedBotId}
                  onChange={(e) => setAssignedBotId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 h-9"
                >
                  <option value="bot_browser_1">Chromium Worker #1 (Playwright)</option>
                  <option value="bot_browser_2">Chromium Worker #2 (Playwright)</option>
                  <option value="bot_planner">Task Planner (Kế hoạch & DOM)</option>
                  <option value="bot_orchestrator">Master Orchestrator (Tổng điều phối)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Số luồng Chromium song song:
                </label>
                <select
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 h-9"
                >
                  <option value={1}>1 Luồng Đơn (Khuyến nghị cho test ToS)</option>
                  <option value={2}>2 Luồng Song Song (Tốc độ cân bằng)</option>
                  <option value={4}>4 Luồng Đa Nhiệm (Hiệu suất cao)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Mức độ ưu tiên (Priority):
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={priority}
                    onChange={(e) => setPriority(Number(e.target.value))}
                    className="bg-slate-950/80 border-slate-800 text-white text-xs h-9 w-24"
                  />
                  <span className="text-[11px] text-slate-400">/ 100</span>
                </div>
              </div>
            </div>

            {/* Status message */}
            {statusMessage && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center justify-between ${
                  statusMessage.type === "success"
                    ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
                }`}
              >
                <span>{statusMessage.text}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStatusMessage(null)}
                  className="h-6 text-xs"
                >
                  Đóng
                </Button>
              </div>
            )}

            {/* Launch Button */}
            <div className="pt-2 flex items-center justify-end gap-3">
              <Button
                type="submit"
                disabled={isSubmitting || !ssrfCheck.isAllowed}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-5 h-9 flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="h-3.5 w-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Đang Khởi Chạy Chromium...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" />
                    Bắt Đầu Chạy Browser Automation Ngay
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

