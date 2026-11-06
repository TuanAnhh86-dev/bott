"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Bot, 
  Cpu, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  RefreshCw, 
  Play, 
  ShieldCheck,
  Zap,
  Layers
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface BotInfo {
  id: string;
  name: string;
  role: string;
  status: "IDLE" | "BUSY" | "ERROR" | "PAUSED";
  currentTaskId?: string | null;
  lastHeartbeat: string;
  tasksCompleted: number;
  tasksFailed: number;
  isHealthy: boolean;
}

interface FleetViewProps {
  onSelectBotForTask?: (botId: string) => void;
}

export function FleetView({ onSelectBotForTask }: FleetViewProps) {
  const [bots, setBots] = useState<BotInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchBots = useCallback(async () => {
    try {
      const res = await fetch("/api/browser/bots");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.bots)) {
          setBots(data.bots);
        }
      }
    } catch (err) {
      console.warn("Không thể tải trạng thái hạm đội bot:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBots();
    const interval = setInterval(fetchBots, 4000);
    return () => clearInterval(interval);
  }, [fetchBots]);

  const handleHeartbeat = async (botId: string) => {
    try {
      const res = await fetch("/api/browser/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat", botId }),
      });
      if (res.ok) {
        setActionMessage(`Đã gửi tín hiệu kiểm tra (Heartbeat) tới ${botId}`);
        fetchBots();
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch {
      setActionMessage("Lỗi khi gửi tín hiệu heartbeat.");
    }
  };

  const handleInitFleet = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/browser/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initialize" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.bots) setBots(data.bots);
        setActionMessage("Đã đồng bộ và khởi tạo lại toàn bộ 6 Agent trong Hạm Đội.");
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch {
      setActionMessage("Lỗi khi khởi tạo lại hạm đội.");
    } finally {
      setIsLoading(false);
    }
  };

  const totalBots = bots.length;
  const onlineBots = bots.filter((b) => b.isHealthy).length;
  const busyBots = bots.filter((b) => b.status === "BUSY").length;
  const idleBots = bots.filter((b) => b.status === "IDLE").length;

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "orchestrator":
        return <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30">Tổng Chỉ Huy (Orchestrator)</Badge>;
      case "planner":
        return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">Kế Hoạch & Selector</Badge>;
      case "browser_executor":
        return <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30">Trình Duyệt Playwright</Badge>;
      case "verifier":
        return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Giám Sát & Đối Soát DOM</Badge>;
      case "supervisor":
        return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">Quản Trị An Toàn Fleet</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Metric Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Tổng Quy Mô Hạm Đội</p>
              <p className="text-2xl font-bold text-white mt-1">{totalBots || 6} <span className="text-xs font-normal text-slate-400">Agents</span></p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Bot className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Trực Tuyến & Khỏe Mạnh</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">{onlineBots} <span className="text-xs font-normal text-slate-400">/ {totalBots || 6}</span></p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Activity className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Đang Chạy Tác Vụ (Busy)</p>
              <p className="text-2xl font-bold text-cyan-400 mt-1">{busyBots}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Cpu className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400 font-medium">Sẵn Sàng Nhận Việc (Idle)</p>
              <p className="text-2xl font-bold text-purple-400 mt-1">{idleBots}</p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-300 flex items-center justify-between">
          <span>{actionMessage}</span>
          <Button variant="ghost" size="sm" onClick={() => setActionMessage(null)} className="h-6 text-xs">Đóng</Button>
        </div>
      )}

      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/40 rounded-xl border border-slate-800">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-400" />
            Trạng Thái Chi Tiết Các Agent Trình Duyệt
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mỗi bot chạy trong ngữ cảnh trình duyệt Chromium / Microsoft Edge độc lập với logging và ảnh bằng chứng thời gian thực.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchBots}
            disabled={isLoading}
            className="border-slate-700 hover:bg-slate-800 text-xs text-slate-200"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Làm mới
          </Button>
          <Button
            size="sm"
            onClick={handleInitFleet}
            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
          >
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Khởi tạo lại Hạm Đội
          </Button>
        </div>
      </div>

      {/* Bot Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {bots.map((bot) => {
          const isBusy = bot.status === "BUSY";
          const isError = bot.status === "ERROR";

          return (
            <Card
              key={bot.id}
              className={`bg-slate-900/60 border-slate-800 transition-all duration-200 hover:border-slate-700 ${
                isBusy ? "border-cyan-500/40 shadow-sm shadow-cyan-500/10" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${
                      isBusy ? "bg-cyan-500/20 text-cyan-400" :
                      isError ? "bg-rose-500/20 text-rose-400" :
                      "bg-slate-800 text-slate-300"
                    }`}>
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold text-white">{bot.name}</CardTitle>
                      <CardDescription className="text-xs font-mono text-slate-400 mt-0.5">{bot.id}</CardDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isBusy ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 animate-pulse">
                        Đang Chạy
                      </span>
                    ) : isError ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
                        Gặp Lỗi
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        Sẵn Sàng
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 pt-0">
                <div className="pt-1">
                  {getRoleBadge(bot.role)}
                </div>

                {bot.currentTaskId && (
                  <div className="p-2 bg-slate-950/60 rounded border border-slate-800/80 text-xs">
                    <p className="text-slate-400 text-[11px]">Tác vụ đang xử lý:</p>
                    <p className="font-mono text-cyan-300 truncate mt-0.5">{bot.currentTaskId}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-800/80">
                  <div>
                    <span className="text-slate-400">Đã hoàn tất:</span>
                    <span className="font-semibold text-emerald-400 ml-1.5">{bot.tasksCompleted}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Thất bại:</span>
                    <span className="font-semibold text-rose-400 ml-1.5">{bot.tasksFailed}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Nhịp tim:
                  </span>
                  <span>{new Date(bot.lastHeartbeat).toLocaleTimeString("vi-VN")}</span>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleHeartbeat(bot.id)}
                    className="flex-1 text-xs border-slate-800 hover:bg-slate-800 h-7"
                  >
                    Ping
                  </Button>
                  {onSelectBotForTask && (
                    <Button
                      size="sm"
                      onClick={() => onSelectBotForTask(bot.id)}
                      className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-500 text-white h-7"
                    >
                      <Play className="h-3 w-3 mr-1" />
                      Giao việc
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

