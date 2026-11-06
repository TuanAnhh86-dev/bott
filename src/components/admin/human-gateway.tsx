"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  ShieldAlert, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  AlertTriangle,
  ExternalLink,
  Camera
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface HumanReviewItem {
  id: string;
  task_id: string;
  bot_id?: string;
  action_type: string;
  barrier_type?: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  target_url?: string;
  screenshot_url?: string;
  resolution_note?: string;
  created_at: string;
  resolved_at?: string;
}

export function HumanGateway() {
  const [reviews, setReviews] = useState<HumanReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [userNote, setUserNote] = useState<string>("");

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch("/api/browser/human-review");
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.reviews)) {
          setReviews(data.reviews);
        }
      }
    } catch (err) {
      console.warn("Không thể tải danh sách phê duyệt Human-in-the-loop:", err);
    }
  }, []);

  useEffect(() => {
    fetchReviews();
    const interval = setInterval(fetchReviews, 4000);
    return () => clearInterval(interval);
  }, [fetchReviews]);

  const handleResolveReview = async (reviewId: string, action: "approve" | "reject") => {
    setProcessingId(reviewId);
    try {
      const res = await fetch("/api/browser/human-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId,
          action,
          note: userNote || (action === "approve" ? "Người dùng đã can thiệp và cho phép tiếp tục." : "Người dùng từ chối thao tác này."),
        }),
      });

      if (res.ok) {
        setActionMessage(
          action === "approve"
            ? "Đã phê duyệt! Trình duyệt sẽ tiếp tục tiến trình tự động."
            : "Đã từ chối tác vụ và gửi lệnh dừng bot an toàn."
        );
        setUserNote("");
        fetchReviews();
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch {
      setActionMessage("Lỗi kết nối khi gửi quyết định phê duyệt.");
    } finally {
      setProcessingId(null);
    }
  };

  const pendingReviews = reviews.filter((r) => r.status === "PENDING");
  const historyReviews = reviews.filter((r) => r.status !== "PENDING");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-900/40 rounded-xl border border-slate-800">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" />
            Cổng Kiểm Soát Human-in-the-Loop & Phê Duyệt An Toàn
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Khi phát hiện Captcha khó, mã OTP hoặc lệnh chuyển tiền, bot BẮT BUỘC tạm dừng để chờ Bác xác nhận theo quy tắc ToS.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchReviews}
          disabled={isLoading}
          className="border-slate-700 hover:bg-slate-800 text-xs text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {actionMessage && (
        <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center justify-between">
          <span>{actionMessage}</span>
          <Button variant="ghost" size="sm" onClick={() => setActionMessage(null)} className="h-6 text-xs">Đóng</Button>
        </div>
      )}

      {/* Pending Reviews Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <span>Tác vụ đang chờ xử lý thủ công</span>
            <Badge className={pendingReviews.length > 0 ? "bg-amber-500/20 text-amber-300 border-amber-500/40" : "bg-slate-800 text-slate-400"}>
              {pendingReviews.length}
            </Badge>
          </h4>
        </div>

        {pendingReviews.length === 0 ? (
          <Card className="bg-slate-900/60 border-slate-800 p-8 text-center">
            <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
              <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h5 className="text-sm font-semibold text-white">Toàn Bộ Hạm Đội Hoạt Động An Toàn</h5>
              <p className="text-xs text-slate-400 mt-1">
                Hiện tại không có tác vụ nào gặp rào cản Captcha/OTP hoặc yêu cầu phê duyệt thủ công. Các bot đang thực thi theo giới hạn an toàn.
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {pendingReviews.map((review) => {
              const isProcessing = processingId === review.id;

              return (
                <Card key={review.id} className="bg-slate-900/80 border-amber-500/40 shadow-lg shadow-amber-500/5">
                  <CardHeader className="pb-3 border-b border-slate-800">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[11px]">
                            {review.barrier_type || "CẦN PHÊ DUYỆT"}
                          </Badge>
                          <span className="text-xs font-mono text-slate-400">Task #{review.task_id.slice(0, 8)}</span>
                        </div>
                        <CardTitle className="text-sm font-semibold text-white mt-2">
                          {review.reason}
                        </CardTitle>
                      </div>
                      <span className="text-xs text-slate-400 flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" />
                        {new Date(review.created_at).toLocaleTimeString("vi-VN")}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-4">
                    {review.target_url && (
                      <div className="text-xs">
                        <span className="text-slate-400">Trang web: </span>
                        <a
                          href={review.target_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-cyan-400 hover:underline inline-flex items-center gap-1"
                        >
                          {review.target_url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}

                    {review.screenshot_url && (
                      <div className="space-y-1.5">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Camera className="h-3.5 w-3.5" />
                          Ảnh chụp thời điểm dừng lại:
                        </span>
                        <div className="aspect-video max-h-56 rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={review.screenshot_url}
                            alt="Barrier Screenshot"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="text-xs text-slate-300 block mb-1">
                        Ghi chú quyết định của Bác (tùy chọn):
                      </label>
                      <input
                        type="text"
                        value={userNote}
                        onChange={(e) => setUserNote(e.target.value)}
                        placeholder="Ví dụ: Đã giải captcha trên máy, tiếp tục cào dữ liệu..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isProcessing}
                        onClick={() => handleResolveReview(review.id, "reject")}
                        className="border-rose-900/60 text-rose-400 hover:bg-rose-950/40 text-xs h-8"
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        Từ chối & Dừng
                      </Button>
                      <Button
                        size="sm"
                        disabled={isProcessing}
                        onClick={() => handleResolveReview(review.id, "approve")}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Phê Duyệt & Tiếp Tục
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* History Section */}
      {historyReviews.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-slate-800">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Lịch sử can thiệp gần đây ({historyReviews.length})
          </h4>
          <div className="space-y-2">
            {historyReviews.slice(0, 5).map((h) => (
              <div key={h.id} className="p-3 bg-slate-900/40 rounded-lg border border-slate-800/80 text-xs flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge className={h.status === "APPROVED" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]" : "bg-rose-500/15 text-rose-400 border-rose-500/30 text-[10px]"}>
                      {h.status === "APPROVED" ? "ĐÃ DUYỆT" : "ĐÃ TỪ CHỐI"}
                    </Badge>
                    <span className="text-white font-medium">{h.reason}</span>
                  </div>
                  {h.resolution_note && (
                    <p className="text-slate-400 text-[11px] mt-1">Ghi chú: {h.resolution_note}</p>
                  )}
                </div>
                <span className="text-[10px] text-slate-500">
                  {h.resolved_at ? new Date(h.resolved_at).toLocaleTimeString("vi-VN") : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

