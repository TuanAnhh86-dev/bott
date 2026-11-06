import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { AdminSignOutButton } from "./sign-out-button";
import { AdminSidebarNav } from "./admin-nav";
import { getAdminIdentity } from "@/lib/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const identity = await getAdminIdentity();
  if (!identity) redirect("/login?next=%2Fadmin");

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col md:flex-row antialiased font-sans">
      {/* Sidebar Navigation - Fixed & Sticky */}
      <aside className="w-full md:w-64 md:sticky md:top-0 md:h-screen md:overflow-y-auto border-b md:border-b-0 md:border-r border-zinc-800/80 bg-[#0c0d14] p-5 shrink-0 flex flex-col justify-between z-30">
        <div className="space-y-6">
          {/* Logo & Public Switch */}
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center font-black text-white text-sm shadow-md shadow-emerald-500/20">
                MÌ
              </div>
              <div>
                <span className="font-extrabold text-sm tracking-tight text-white block">EM MÌ Console</span>
                <p className="text-[10px] text-slate-400 font-mono truncate max-w-[110px]">{identity.email ?? "admin@emmi.local"}</p>
              </div>
            </div>
            <Link 
              href="/" 
              className="text-slate-400 hover:text-emerald-400 text-xs flex items-center gap-1 px-2 py-1 rounded bg-zinc-900 border border-zinc-800 transition-colors"
              title="Về trang công khai"
            >
              <ArrowLeft className="h-3 w-3" /> Public
            </Link>
          </div>

          {/* Interactive Client Navigation */}
          <AdminSidebarNav />
        </div>

        {/* Sidebar Footer Status */}
        <div className="pt-4 border-t border-zinc-800/80 space-y-3">
          <div className="p-3 rounded-xl bg-zinc-900/80 border border-zinc-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Autonomy:</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                CONTROLLED
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Model:</span>
              <span className="text-slate-300 font-mono text-[11px]">Gemini 3.6 Flash</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">Target:</span>
              <span className="text-emerald-400 font-bold font-mono">5.000.000 ₫</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-slate-400">Em Mì Autonomous v1.0</span>
            <AdminSignOutButton />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
