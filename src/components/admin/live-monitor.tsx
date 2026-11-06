"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  Activity, 
  Camera, 
  Terminal, 
  RefreshCw, 
  Eye, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Clock,
  Layers,
  ExternalLink,
  X
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BrowserExecutionLog } from "@/features/browser/types";

interface LiveMonitorProps {
  initialRefresh?: boolean;
}

export function LiveMonitor({ initialRefresh }: LiveMonitorProps) {
  const [events, setEvents] = useState<BrowserExecutionLog[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<BrowserExecutionLog | null>(null);
  const [selectedScreenshotModal, setSelectedScreenshotModal] = useState<{
    url?: string;
    filePath?: string;
    title?: string;
    timestamp?: string;
    score?: number;
  } | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch("/api/browser/events");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.events)) {
          setEvents(data.events);
        }
      }
    } catch (err) {
      console.warn("Không thể tải dòng sự kiện trình duyệt:", err);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 2500);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const getEventBadge = (type: string) => {
    switch (type) {
      case "BROWSER_LAUNCHED":
        return <Badge className="bg-indigo-500/15 text-indigo-400 border-indigo-500/30">Mở Trình Duyệt</Badge>;
      case "PAGE_NAVIGATED":
        return <Badge className="bg-blue-500/15 text-blue-400 border-blue-500/30">Tải URL</Badge>;
      case "DOM_INSPECTED":
        return <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30">Quét DOM</Badge>;
      case "ELEMENT_CLICKED":
        return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">Click Element</Badge>;
      case "FORM_FILLED":
        return <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30">Điền Form</Badge>;
      case "SCREENSHOT_CAPTURED":
        return <Badge className="bg-pink-500/15 text-pink-400 border-pink-500/30">Chụp Ảnh</Badge>;
      case "BARRIER_DETECTED":
        return <Badge className="bg-rose-500/15 text-rose-400 border-rose-500/30">Phát Hiện Rào Cản</Badge>;
      case "VERIFIED_SUCCESS":
        return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Xác Thực Thành Công</Badge>;
      case "TASK_COMPLETED":
        return <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">Hoàn Tất</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  // Find events that captured screenshots
  const screenshotEvents = events.filter(
    (e) => e.eventType === "SCREENSHOT_CAPTURED" || Boolean(e.details?.filePath || e.details?.evidenceId)
  );

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/40 rounded-xl border border-slate-800">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            Giám Sát Nhật Ký Thực Thi & Bằng Chứng Thời Gian Thực
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Mọi thao tác Chromium (tải trang, tương tác DOM, chụp ảnh, rà soát ToS) được ghi lại liên tục, đối soát minh bạch.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchEvents}
          disabled={isLoadingEvents}
          className="border-slate-700 hover:bg-slate-800 text-xs text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoadingEvents ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {/* 2-Column Split: Events & Evidence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Live Event Stream (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <Card className="bg-slate-900/60 border-slate-800 h-[620px] flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  Dòng Sự Kiện Thực Thi (Live Stream)
                </CardTitle>
                <Badge variant="outline" className="text-[11px] text-slate-400 font-mono">
                  {events.length} sự kiện
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-0 flex-1 overflow-y-auto">
              {events.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <Terminal className="h-10 w-10 text-slate-600 mb-2" />
                  <p className="text-xs font-semibold text-slate-400">Chưa có sự kiện duyệt web mới</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                    Khởi chạy một nhiệm vụ tại tab &quot;Phân Việc & Giao Link&quot; để quan sát các bước điều hướng và thao tác của bot.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800/60 font-mono text-xs">
                  {events.map((evt) => {
                    const isSelected = selectedEvent?.id === evt.id;
                    const dateStr = new Date(evt.timestamp).toLocaleTimeString("vi-VN");

                    return (
                      <div
                        key={evt.id}
                        onClick={() => setSelectedEvent(evt)}
                        className={`p-3 cursor-pointer transition-colors ${
                          isSelected ? "bg-slate-800/80" : "hover:bg-slate-900/90"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500">{dateStr}</span>
                            {getEventBadge(evt.eventType)}
                          </div>
                          <span className="text-[11px] text-cyan-400 font-medium">
                            {evt.botId}
                          </span>
                        </div>

                        {evt.url && (
                          <p className="text-[11px] text-slate-300 truncate mt-1">
                            URL: <span className="text-slate-400">{evt.url}</span>
                          </p>
                        )}

                        {evt.stepName && (
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            Bước: {evt.stepName}
                          </p>
                        )}

                        {evt.details && Object.keys(evt.details).length > 0 && (
                          <p className="text-[10px] text-slate-500 mt-1 truncate">
                            Chi tiết: {JSON.stringify(evt.details)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Screenshot & Evidence Gallery (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <Card className="bg-slate-900/60 border-slate-800 h-[620px] flex flex-col">
            <CardHeader className="pb-3 border-b border-slate-800/80">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Camera className="h-4 w-4 text-pink-400" />
                  Ảnh Bằng Chứng & Đối Soát DOM
                </CardTitle>
                <Badge variant="outline" className="text-[11px] text-pink-400 border-pink-500/30">
                  {screenshotEvents.length} ảnh xác thực
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-4 flex-1 overflow-y-auto space-y-4">
              {screenshotEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                  <Camera className="h-10 w-10 text-slate-600 mb-2" />
                  <p className="text-xs font-semibold text-slate-400">Chưa có ảnh chụp bằng chứng</p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                    Khi trình duyệt hoàn thành thao tác tải trang hoặc khảo sát, ảnh chụp màn hình PNG thực tế từ Chromium sẽ lưu tại đây.
                  </p>
                </div>
              ) : (
                screenshotEvents.map((evt) => {
                  const filePath = (evt.details?.filePath as string) || "/evidence/screenshots/default.png";
                  const base64Thumb = evt.details?.base64Thumbnail as string | undefined;

                  return (
                    <div
                      key={evt.id}
                      className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white truncate max-w-[200px]">
                          {evt.url || "Phiên duyệt web"}
                        </span>
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                          Xác thực
                        </Badge>
                      </div>

                      {/* Thumbnail view */}
                      <div
                        onClick={() =>
                          setSelectedScreenshotModal({
                            url: evt.url,
                            filePath,
                            title: evt.stepName || "Ảnh chụp bằng chứng duyệt web",
                            timestamp: evt.timestamp,
                          })
                        }
                        className="relative aspect-video bg-slate-900 rounded-lg overflow-hidden border border-slate-800 cursor-pointer group"
                      >
                        {base64Thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={base64Thumb}
                            alt="Screenshot proof"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                            <Camera className="h-8 w-8 mb-1" />
                            <span className="text-[11px] font-mono">{filePath}</span>
                          </div>
                        )}

                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white text-xs font-medium">
                          <Eye className="h-4 w-4" />
                          Xem ảnh phóng to
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                        <span>Bot: <span className="text-cyan-300 font-mono">{evt.botId}</span></span>
                        <span>{new Date(evt.timestamp).toLocaleTimeString("vi-VN")}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Fullscreen Screenshot Modal */}
      {selectedScreenshotModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white">
                  {selectedScreenshotModal.title || "Ảnh Bằng Chứng Duyệt Web"}
                </h4>
                {selectedScreenshotModal.url && (
                  <p className="text-xs text-slate-400 font-mono truncate max-w-xl mt-0.5">
                    {selectedScreenshotModal.url}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedScreenshotModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 flex-1 overflow-auto bg-slate-950 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedScreenshotModal.filePath}
                alt="Full resolution evidence"
                className="max-w-full max-h-[70vh] rounded-lg border border-slate-800 object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between text-xs text-slate-400">
              <span>Đường dẫn tệp: <span className="font-mono text-cyan-300">{selectedScreenshotModal.filePath}</span></span>
              <span>Thời điểm: {selectedScreenshotModal.timestamp ? new Date(selectedScreenshotModal.timestamp).toLocaleString("vi-VN") : "N/A"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

