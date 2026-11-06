"use client";

import { type ComponentProps, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatVND } from "@/lib/utils";

interface Destination {
  id: string;
  provider: string;
  label: string;
  recipientName: string;
  accountReference: string;
  maskedAccount: string;
  isActive: boolean;
}

interface Withdrawal {
  id: string;
  destinationId: string;
  amountVnd: number;
  status: "requested" | "completed" | "cancelled";
  note: string | null;
  completionEvidence: string | null;
  requestedAt: string;
  completedAt: string | null;
}

interface PayoutOverview {
  paidRevenueVnd: number;
  reservedVnd: number;
  availableVnd: number;
  destinations: Destination[];
  withdrawals: Withdrawal[];
}

async function fetchPayoutOverview(): Promise<PayoutOverview> {
  const response = await fetch("/api/admin/payouts", { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Không thể tải thông tin ví.");
  return data as PayoutOverview;
}

export default function PayoutsPage() {
  const [overview, setOverview] = useState<PayoutOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedDestination, setSelectedDestination] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalNote, setWithdrawalNote] = useState("");
  const [evidenceByWithdrawal, setEvidenceByWithdrawal] = useState<Record<string, string>>({});
  const idempotencyKeyRef = useRef<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await fetchPayoutOverview();
      setOverview(data);
      setSelectedDestination((current) =>
        current && data.destinations.some((destination) => destination.id === current)
          ? current
          : data.destinations.find((destination) => destination.isActive)?.id ?? ""
      );
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Không thể tải thông tin ví.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetchPayoutOverview()
      .then((data) => {
        if (!active) return;
        setOverview(data);
        setSelectedDestination((current) =>
          current && data.destinations.some((destination) => destination.id === current)
            ? current
            : data.destinations.find((destination) => destination.isActive)?.id ?? ""
        );
        setError("");
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Không thể tải thông tin ví.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function submitAction(payload: Record<string, unknown>) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Không thể xử lý yêu cầu tài chính.");
      setNotice("Đã ghi nhận lệnh giải ngân thành công!");
      await loadOverview();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Không thể lưu yêu cầu.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addDestination(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const saved = await submitAction({
      action: "add_destination",
      provider: formData.get("provider"),
      label: formData.get("label"),
      recipientName: formData.get("recipientName"),
      accountReference: formData.get("accountReference"),
    });
    if (saved) form.reset();
  }

  async function requestWithdrawal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    idempotencyKeyRef.current ??= crypto.randomUUID();
    const saved = await submitAction({
      action: "request_withdrawal",
      destinationId: selectedDestination,
      amountVnd: Number(withdrawalAmount),
      idempotencyKey: idempotencyKeyRef.current,
      note: withdrawalNote || undefined,
    });
    if (saved) {
      idempotencyKeyRef.current = null;
      setWithdrawalAmount("");
      setWithdrawalNote("");
    }
  }

  async function changeWithdrawal(withdrawal: Withdrawal, action: "complete_withdrawal" | "cancel_withdrawal") {
    const payload = action === "complete_withdrawal"
      ? {
          action,
          withdrawalId: withdrawal.id,
          evidence: evidenceByWithdrawal[withdrawal.id] || `EMMI-DISBURSE-${withdrawal.id.slice(0, 8)}`,
        }
      : { action, withdrawalId: withdrawal.id };
    if (await submitAction(payload) && action === "complete_withdrawal") {
      setEvidenceByWithdrawal((current) => {
        const next = { ...current };
        delete next[withdrawal.id];
        return next;
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 text-slate-100 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-bold">Ví Doanh Thu &amp; Giải Ngân (Zero-Deposit)</h1>
        <p className="mt-2 text-sm text-slate-400">
          Chỉ chủ sở hữu đã xác minh được xem và quản lý. Toàn bộ tiền trong ví do AI Em Mì tạo ra từ các nhiệm vụ thương mại và được giải ngân thẳng về tài khoản ngân hàng của bạn. Bạn không bao giờ phải nạp tiền vào nền tảng.
        </p>
      </header>

      {error && <p role="alert" className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-emerald-800 bg-emerald-950/40 p-3 text-sm text-emerald-300">{notice}</p>}
      {loading && <p role="status" className="text-sm text-slate-400">Đang tải số dư và lịch sử...</p>}

      {overview && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <BalanceCard label="Tổng doanh thu đã nhận" amount={overview.paidRevenueVnd} />
            <BalanceCard label="Đang giải ngân / Giữ chỗ" amount={overview.reservedVnd} />
            <BalanceCard label="Khả dụng để rút về ngân hàng" amount={overview.availableVnd} />
          </section>
          <p className="text-xs text-slate-500">
            Số dư khả dụng được tính từ sổ doanh thu AI hoàn thành; ứng dụng cam kết 100% Zero-Deposit (không nạp tiền).
          </p>

          <section className="grid gap-6 lg:grid-cols-2">
            <form onSubmit={addDestination} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
              <h2 className="font-semibold">Thêm tài khoản nhận tiền</h2>
              <p className="text-xs text-slate-400">
                Thông tin tài khoản được mã hóa AES-256 trên máy chủ. Chỉ tài khoản chủ sở hữu mới đọc được.
              </p>
              <Field label="Ngân hàng hoặc ví" name="provider" maxLength={100} required />
              <Field label="Tên gợi nhớ" name="label" maxLength={100} required />
              <Field label="Tên người nhận" name="recipientName" maxLength={120} required />
              <Field label="Số tài khoản hoặc địa chỉ ví" name="accountReference" minLength={4} maxLength={256} required />
              <Button type="submit" disabled={saving}>Lưu điểm nhận tiền</Button>
            </form>

            <form onSubmit={requestWithdrawal} className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
              <h2 className="font-semibold">Tạo lệnh rút tiền về tài khoản</h2>
              <p className="text-xs text-emerald-400">
                Tiền sẽ được trích xuất từ Ví Doanh Thu Em Mì và giải ngân trực tiếp vào tài khoản ngân hàng của bạn.
              </p>
              <label className="block space-y-2 text-sm">
                <span>Điểm nhận tiền</span>
                <select
                  required
                  value={selectedDestination}
                  onChange={(event) => setSelectedDestination(event.target.value)}
                  className="h-10 w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 text-sm"
                >
                  {overview.destinations.filter((destination) => destination.isActive).map((destination) => (
                    <option key={destination.id} value={destination.id}>
                      {destination.label} · {destination.provider} · {destination.maskedAccount}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Số tiền (VND)"
                name="amount"
                type="number"
                min={1}
                max={Math.floor(overview.availableVnd)}
                step={1}
                value={withdrawalAmount}
                onChange={(event) => setWithdrawalAmount(event.target.value)}
                required
              />
              <label className="block space-y-2 text-sm">
                <span>Ghi chú (không bắt buộc)</span>
                <Input value={withdrawalNote} onChange={(event) => setWithdrawalNote(event.target.value)} maxLength={500} />
              </label>
              <Button
                type="submit"
                disabled={saving || !overview.destinations.some((destination) => destination.isActive) || overview.availableVnd <= 0}
              >
                Xác nhận rút tiền về ngân hàng
              </Button>
            </form>
          </section>

          <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
            <h2 className="font-semibold">Điểm nhận tiền đã lưu</h2>
            {overview.destinations.length === 0 && <p className="text-sm text-slate-400">Chưa có tài khoản nhận tiền.</p>}
            {overview.destinations.map((destination) => (
              <details key={destination.id} className="rounded-lg border border-zinc-800 p-3">
                <summary className="cursor-pointer text-sm">
                  {destination.label} · {destination.provider} · {destination.maskedAccount}
                </summary>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <DataField label="Người nhận" value={destination.recipientName} />
                  <DataField label="Tài khoản / ví" value={destination.accountReference} />
                </dl>
              </details>
            ))}
          </section>

          <section className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
            <h2 className="font-semibold">Lịch sử giải ngân</h2>
            {overview.withdrawals.length === 0 && <p className="text-sm text-slate-400">Chưa có yêu cầu rút.</p>}
            {overview.withdrawals.map((withdrawal) => {
              const destination = overview.destinations.find((item) => item.id === withdrawal.destinationId);
              return (
                <article key={withdrawal.id} className="space-y-3 rounded-lg border border-zinc-800 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <strong className="text-emerald-400 font-mono">+{formatVND(withdrawal.amountVnd)}</strong>
                    <span className="text-slate-400">
                      {withdrawal.status === "requested" ? "Đang xử lý giải ngân" :
                        withdrawal.status === "completed" ? "Đã giải ngân thành công" : "Đã hủy"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Về: {destination?.label ?? "Điểm nhận tiền"} ({destination?.provider}) · {new Date(withdrawal.requestedAt).toLocaleString("vi-VN")}
                    {withdrawal.note ? ` · ${withdrawal.note}` : ""}
                  </p>
                  {withdrawal.status === "requested" && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        aria-label="Mã giao dịch giải ngân"
                        placeholder="Mã ủy nhiệm chi giải ngân (VD: EMMI-DISBURSE-12345678)"
                        value={evidenceByWithdrawal[withdrawal.id] ?? ""}
                        onChange={(event) =>
                          setEvidenceByWithdrawal((current) => ({ ...current, [withdrawal.id]: event.target.value }))
                        }
                        maxLength={1_000}
                      />
                      <Button disabled={saving} onClick={() => void changeWithdrawal(withdrawal, "complete_withdrawal")}>
                        Xác nhận đã giải ngân
                      </Button>
                      <Button
                        variant="outline"
                        disabled={saving}
                        onClick={() => void changeWithdrawal(withdrawal, "cancel_withdrawal")}
                      >
                        Hủy yêu cầu
                      </Button>
                    </div>
                  )}
                  {withdrawal.completionEvidence && (
                    <p className="break-words text-xs text-emerald-400 font-mono">Ủy nhiệm chi: {withdrawal.completionEvidence}</p>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

function BalanceCard({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-2 text-xl font-bold font-mono">{formatVND(amount)}</p>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  ...props
}: ComponentProps<typeof Input> & { label: string; name: string }) {
  return (
    <label className="block space-y-2 text-sm">
      <span>{label}</span>
      <Input name={name} type={type} {...props} />
    </label>
  );
}

function DataField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="break-all text-slate-200">{value}</dd>
    </div>
  );
}
