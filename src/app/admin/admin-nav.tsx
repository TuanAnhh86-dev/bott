"use client";

import React, { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  CheckSquare,
  DollarSign,
  Target,
  Wallet,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

function SidebarNavContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const currentTab = searchParams.get("tab") || "overview";

  const navItems = [
    {
      id: "overview",
      label: "Tổng Quan & Điều Hành",
      icon: LayoutDashboard,
      color: "text-emerald-400",
    },
    {
      id: "dispatch",
      label: "Phân Việc & Worker Fleet",
      icon: CheckSquare,
      color: "text-teal-400",
    },
    {
      id: "research",
      label: "Nghiên Cứu Web Trực Tuyến",
      icon: Sparkles,
      color: "text-blue-400",
    },
    {
      id: "accounts",
      label: "Quản Lý Tài Khoản AI",
      icon: ShieldCheck,
      color: "text-amber-400",
    },
  ];

  const businessItems = [
    {
      id: "platforms",
      label: "Nền Tảng Kinh Doanh",
      icon: Briefcase,
      color: "text-purple-400",
    },
    {
      id: "revenue",
      label: "Sổ Quỹ & Doanh Thu",
      icon: DollarSign,
      color: "text-emerald-400",
    },
    {
      id: "wallet",
      label: "Ví dự trữ & Rút tiền",
      icon: Wallet,
      color: "text-teal-400",
    },
    {
      id: "kpi",
      label: "Mục Tiêu KPI 5 Triệu",
      icon: Target,
      color: "text-rose-400",
    },
  ];

  const handleNavigate = (tabId: string) => {
    router.push(`/admin?tab=${tabId}`);
  };

  return (
    <nav className="space-y-1 text-xs">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNavigate(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer font-medium text-left ${
              isActive
                ? "bg-emerald-500/15 text-white border border-emerald-500/30 font-bold shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-zinc-900/60"
            }`}
          >
            <Icon className={`h-4 w-4 ${item.color}`} />
            <span>{item.label}</span>
          </button>
        );
      })}

      <div className="pt-3 pb-1 border-t border-zinc-800/60 text-[10px] uppercase font-bold text-slate-500 tracking-wider px-3">
        Kinh Doanh & Doanh Thu
      </div>

      {businessItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleNavigate(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all cursor-pointer font-medium text-left ${
              isActive
                ? "bg-emerald-500/15 text-white border border-emerald-500/30 font-bold shadow-sm"
                : "text-slate-400 hover:text-white hover:bg-zinc-900/60"
            }`}
          >
            <Icon className={`h-4 w-4 ${item.color}`} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function AdminSidebarNav() {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse bg-zinc-900/40 rounded-xl" />}>
      <SidebarNavContent />
    </Suspense>
  );
}

