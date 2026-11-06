"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
  DollarSign, 
  Wallet, 
  Target, 
  ArrowUpRight, 
  CreditCard, 
  ShieldCheck, 
  CheckCircle2, 
  Clock, 
  RefreshCw,
  Building2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatVND } from "@/lib/utils";
import { VIETNAMESE_BANKS } from "@/features/payouts/banks";

export function FinanceKpiView() {
  const [kpi, setKpi] = useState({
    targetVnd: 5000000,
    achievedNetVnd: 0,
    grossVnd: 0,
    expensesVnd: 0,
    completionPct: 0,
    remainingVnd: 5000000,
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
  });

  const [withdrawAmount, setWithdrawAmount] = useState<number>(200000);
  const [selectedBank, setSelectedBank] = useState<string>("VCB");
  const [accountNumber, setAccountNumber] = useState<string>("");
  const [accountName, setAccountName] = useState<string>("");
  const [isRequestingWithdraw, setIsRequestingWithdraw] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchKpi = useCallback(async () => {
    try {
      const res = await fetch("/api/kpi");
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.kpi) {
          setKpi(data.kpi);
        }
      }
    } catch {
      // Fallback
    }
  }, []);

  useEffect(() => {
    fetchKpi();
  }, [fetchKpi]);

  const handleWithdrawRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    if (!accountNumber || !accountName) {
      setNotice({ type: "error", text: "Vui lòng nhập đầy đủ số tài khoản và tên thụ hưởng." });
      return;
    }

    if (withdrawAmount <= 0) {
      setNotice({ type: "error", text: "Số tiền rút phải lớn hơn 0đ." });
      return;
    }

    setIsRequestingWithdraw(true);

    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountVnd: withdrawAmount,
          bankCode: selectedBank,
          accountNumber,
          accountName,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setNotice({
          type: "success",
          text: `Đã tạo yêu cầu rút tiền thành công (Mã: ${data.payout?.id?.slice(0, 8) ?? "N/A"}). Yêu cầu đã chuyển tới Cổng Phê Duyệt An Toàn.`,
        });
        setAccountNumber("");
        setAccountName("");
      } else {
        setNotice({
          type: "error",
          text: data.error || "Không thể tạo yêu cầu rút tiền lúc này.",
        });
      }
    } catch {
      setNotice({ type: "error", text: "Lỗi kết nối khi gửi yêu cầu rút tiền." });
    } finally {
      setIsRequestingWithdraw(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI Overview Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900/60 border-slate-800 md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
                  <Target className="h-4 w-4 text-emerald-400" />
                  Mục Tiêu Doanh Thu KPI Tháng {kpi.month}/{kpi.year}
                </CardTitle>
                <CardDescription className="text-xs text-slate-400 mt-0.5">
                  KPI cốt lõi của nền tảng Em Mì: 5.000.000 ₫/tháng từ các nhiệm vụ số hợp pháp.
                </CardDescription>
              </div>
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                {kpi.completionPct}% Hoàn thành
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Đã đạt: <strong className="text-emerald-400">{formatVND(kpi.achievedNetVnd)}</strong></span>
                <span className="text-slate-400">Chỉ tiêu: <strong className="text-white">{formatVND(kpi.targetVnd)}</strong></span>
              </div>
              <Progress value={Math.min(100, kpi.completionPct)} className="h-2 bg-slate-800" />
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs">
              <div>
                <p className="text-slate-500 text-[11px]">Tổng Thu Thực Tế</p>
                <p className="text-white font-semibold mt-0.5">{formatVND(kpi.grossVnd)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[11px]">Chi Phí Vận Hành / AI</p>
                <p className="text-rose-400 font-semibold mt-0.5">{formatVND(kpi.expensesVnd)}</p>
              </div>
              <div>
                <p className="text-slate-500 text-[11px]">Còn Cách Đích</p>
                <p className="text-amber-400 font-semibold mt-0.5">{formatVND(kpi.remainingVnd)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Current Balance Card */}
        <Card className="bg-slate-900/60 border-slate-800 flex flex-col justify-between">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Wallet className="h-4 w-4 text-cyan-400" />
              Số Dư Khả Dụng Rút
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Chỉ tính các khoản tiền đã xác thực bằng chứng
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="text-3xl font-bold text-white tracking-tight">
              {formatVND(kpi.achievedNetVnd)}
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              Mọi lệnh rút đều qua chốt chặn xác nhận của Bác
            </p>
          </CardContent>
        </Card>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between ${
            notice.type === "success"
              ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-300"
              : "bg-rose-500/15 border border-rose-500/30 text-rose-300"
          }`}
        >
          <span>{notice.text}</span>
          <Button variant="ghost" size="sm" onClick={() => setNotice(null)} className="h-6 text-xs">
            Đóng
          </Button>
        </div>
      )}

      {/* Withdrawal Studio */}
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-400" />
            Tạo Lệnh Rút Tiền Về Ngân Hàng / PayPal
          </CardTitle>
          <CardDescription className="text-xs text-slate-400">
            Hệ thống hỗ trợ 16 ngân hàng Việt Nam (NAPAS 247) và cổng quốc tế. Lệnh rút tiền BẮT BUỘC cần phê duyệt thủ công.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleWithdrawRequest} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Số tiền muốn rút (VNĐ):
                </label>
                <input
                  type="number"
                  min={50000}
                  step={10000}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 h-9"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Ngân hàng nhận thụ hưởng:
                </label>
                <select
                  value={selectedBank}
                  onChange={(e) => setSelectedBank(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 h-9"
                >
                  {VIETNAMESE_BANKS.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.shortName} - {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Số tài khoản nhận tiền:
                </label>
                <input
                  type="text"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  placeholder="Nhập số tài khoản ngân hàng..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 h-9 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1.5">
                  Họ tên chủ tài khoản (viết hoa không dấu):
                </label>
                <input
                  type="text"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value.toUpperCase())}
                  placeholder="NGUYEN VAN A"
                  className="w-full bg-slate-950 border border-slate-800 rounded-md p-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 h-9"
                  required
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end">
              <Button
                type="submit"
                disabled={isRequestingWithdraw}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-9 px-5"
              >
                {isRequestingWithdraw ? (
                  "Đang xử lý..."
                ) : (
                  <>
                    <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
                    Gửi Yêu Cầu Rút Tiền
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

