"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { 
  Bot, 
  Cpu, 
  Zap, 
  ShieldAlert, 
  ShieldCheck, 
  Layers, 
  Globe, 
  DollarSign, 
  Activity, 
  MessageSquare, 
  RefreshCw, 
  Power, 
  ExternalLink,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FleetView } from "@/components/admin/fleet-view";
import { DispatchStudio } from "@/components/admin/dispatch-studio";
import { LiveMonitor } from "@/components/admin/live-monitor";
import { HumanGateway } from "@/components/admin/human-gateway";
import { FinanceKpiView } from "@/components/admin/finance-kpi";
import { BeBoDrawer } from "@/components/admin/be-bo-drawer";

export type AdminTab = "fleet" | "dispatch" | "monitor" | "human" | "finance";

function AdminConsoleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = (searchParams.get("tab") as AdminTab) || "fleet";
  const [activeTab, setActiveTab] = useState<AdminTab>(tabParam);
  const [preselectedBotId, setPreselectedBotId] = useState<string | null>(null);

  // Emergency Stop state
  const [isEmergencyStop, setIsEmergencyStop] = useState(false);
  const [isTogglingEmergency, setIsTogglingEmergency] = useState(false);

  // Bé Bơ Co-pilot drawer state
  const [isBeBoOpen, setIsBeBoOpen] = useState(false);

  // Sync tab with URL query parameter
  const switchTab = (tab: AdminTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`/admin?${params.toString()}`);
  };

  // Check Emergency Stop state
  const checkEmergencyStop = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/stop");
      if (res.ok) {
        const data = await res.json();
        setIsEmergencyStop(Boolean(data.emergencyStopActive));
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    checkEmergencyStop();
  }, [checkEmergencyStop]);

  const handleToggleEmergencyStop = async () => {
    setIsTogglingEmergency(true);
    try {
      const res = await fetch("/api/agent/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !isEmergencyStop }),
      });
      if (res.ok) {
        const data = await res.json();
        setIsEmergencyStop(Boolean(data.emergencyStopActive));
      }
    } catch (err) {
      console.warn("Lỗi chuyển đổi Emergency Stop:", err);
    } finally {
      setIsTogglingEmergency(false);
    }
  };

  // Action from FleetView to preselect a bot in DispatchStudio
  const handleSelectBotForTask = (botId: string) => {
    setPreselectedBotId(botId);
    switchTab("dispatch");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center font-bold text-white shadow-md shadow-emerald-500/20">
              MÌ
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-white tracking-tight">EM MÌ Console</h1>
                <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] py-0 px-1.5">
                  Multi-Agent v2.0
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400">Hệ thống Tự Động Hóa Trình Duyệt Kiếm Tiền Hợp Pháp</p>
            </div>
          </div>

          {/* Center Indicators (Hidden on small screens) */}
          <div className="hidden lg:flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Edge Chromium Engine: <strong>SẴN SÀNG</strong></span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300">
              <ShieldCheck className="h-3.5 w-3.5 text-cyan-400" />
              <span>SSRF & ToS Guard: <strong>BẬT</strong></span>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Emergency Stop Button */}
            <Button
              variant="outline"
              size="sm"
              disabled={isTogglingEmergency}
              onClick={handleToggleEmergencyStop}
              className={`text-xs h-8 font-medium transition-colors ${
                isEmergencyStop
                  ? "bg-rose-500 text-white border-rose-600 hover:bg-rose-600 animate-pulse"
                  : "border-slate-800 text-slate-300 hover:bg-rose-950/40 hover:text-rose-400 hover:border-rose-900"
              }`}
              title="Dừng khẩn cấp toàn bộ tác vụ trình duyệt"
            >
              <Power className="h-3.5 w-3.5 mr-1.5" />
              {isEmergencyStop ? "DỪNG KHẨN CẤP ĐANG BẬT" : "Dừng Khẩn Cấp"}
            </Button>

            {/* Bé Bơ Co-pilot Button */}
            <Button
              size="sm"
              onClick={() => setIsBeBoOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8 flex items-center gap-1.5 shadow-sm shadow-emerald-500/20"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Bé Bơ AI</span>
            </Button>

            {/* Public Link */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="text-slate-400 hover:text-white text-xs h-8 px-2"
              title="Xem trang Dashboard cộng đồng"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Emergency Stop Banner if active */}
      {isEmergencyStop && (
        <div className="bg-rose-900/60 border-b border-rose-700 px-4 py-2.5 text-center text-xs text-rose-200 flex items-center justify-center gap-2">
          <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
          <span>
            <strong>CẢNH BÁO:</strong> Hệ thống đang ở chế độ <strong>DỪNG KHẨN CẤP (EMERGENCY STOP)</strong>. Toàn bộ worker Chromium đã bị khóa. Nhấn &quot;DỪNG KHẨN CẤP ĐANG BẬT&quot; phía trên để mở khóa.
          </span>
        </div>
      )}

      {/* Navigation Pills */}
      <nav className="border-b border-slate-800/80 bg-slate-900/40 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto flex items-center gap-1 sm:gap-2 overflow-x-auto py-2.5 no-scrollbar">
          <button
            type="button"
            onClick={() => switchTab("fleet")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "fleet"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow-sm shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Bot className="h-3.5 w-3.5" />
            <span>1. Hạm Đội Bot (Fleet)</span>
          </button>

          <button
            type="button"
            onClick={() => switchTab("dispatch")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "dispatch"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow-sm shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>2. Phân Việc & Giao Link</span>
          </button>

          <button
            type="button"
            onClick={() => switchTab("monitor")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "monitor"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow-sm shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <Activity className="h-3.5 w-3.5" />
            <span>3. Nhật Ký & Bằng Chứng</span>
          </button>

          <button
            type="button"
            onClick={() => switchTab("human")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "human"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow-sm shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>4. Cổng Phê Duyệt An Toàn</span>
          </button>

          <button
            type="button"
            onClick={() => switchTab("finance")}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 flex items-center gap-2 whitespace-nowrap ${
              activeTab === "finance"
                ? "bg-emerald-500 text-slate-950 font-semibold shadow-sm shadow-emerald-500/20"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
            }`}
          >
            <DollarSign className="h-3.5 w-3.5" />
            <span>5. Sổ Quỹ & KPI</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === "fleet" && (
          <FleetView onSelectBotForTask={handleSelectBotForTask} />
        )}

        {activeTab === "dispatch" && (
          <DispatchStudio
            preselectedBotId={preselectedBotId}
            onTaskDispatched={() => switchTab("monitor")}
          />
        )}

        {activeTab === "monitor" && (
          <LiveMonitor />
        )}

        {activeTab === "human" && (
          <HumanGateway />
        )}

        {activeTab === "finance" && (
          <FinanceKpiView />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/90 px-4 py-3 text-center text-[11px] text-slate-500">
        Em Mì Platform v2.0 • Native Chromium Browser Automation • Tuân thủ ToS & An toàn Dữ liệu
      </footer>

      {/* Bé Bơ Co-Pilot Slide Drawer */}
      <BeBoDrawer
        isOpen={isBeBoOpen}
        onClose={() => setIsBeBoOpen(false)}
        onTaskTriggered={() => {
          // If Bé Bơ triggered a task, refresh or switch
        }}
      />
    </div>
  );
}

export default function AdminConsolePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin" />
            <span>Đang tải Em Mì Console...</span>
          </div>
        </div>
      }
    >
      <AdminConsoleContent />
    </Suspense>
  );
}
