"use client";

import { FormEvent, useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShieldCheck, ArrowRight, Sparkles, KeyRound, UserPlus } from "lucide-react";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already authenticated, redirect straight to admin
  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          window.location.href = "/admin";
        }
      });
    } catch {
      // ignore
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setError("");
    setSuccessMsg("");
    setIsSubmitting(true);

    try {
      const supabase = createClient();

      if (mode === "signin") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (signInError) {
          const msg = signInError.message.toLowerCase();
          if (msg.includes("invalid login credentials")) {
            setError("Email hoặc mật khẩu không chính xác. Bác vui lòng kiểm tra lại.");
          } else if (msg.includes("email not confirmed")) {
            setError("Email chưa được xác nhận trong hệ thống Supabase Auth.");
          } else if (msg.includes("rate limit")) {
            setError("Bạn đã thử quá nhiều lần. Vui lòng đợi 1 phút và thử lại.");
          } else {
            setError(`Lỗi xác thực: ${signInError.message}`);
          }
          return;
        }

        if (data.session) {
          setSuccessMsg("Đăng nhập thành công! Đang chuyển hướng vào Trung Tâm Điều Hành...");
          window.location.href = "/admin";
        }
      } else {
        // Sign up new administrator
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (signUpError) {
          setError(`Lỗi tạo tài khoản: ${signUpError.message}`);
          return;
        }

        if (data.session) {
          setSuccessMsg("Tạo tài khoản thành công! Đang chuyển hướng vào Admin...");
          window.location.href = "/admin";
        } else {
          setSuccessMsg("Tài khoản đã tạo! Bác có thể bấm Đăng nhập hoặc vào thẳng Admin.");
        }
      }
    } catch (err: unknown) {
      console.error("[AdminLogin] Error:", err);
      const errMsg = err instanceof Error ? err.message : "Không thể kết nối dịch vụ xác thực Supabase.";
      setError(errMsg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090a0f] px-4 py-8 text-slate-100 font-sans">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 items-center justify-center font-black text-white text-lg shadow-lg shadow-emerald-500/25">
            MÌ
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Trung Tâm Điều Hành Em Mì
          </h1>
          <p className="text-xs text-slate-400">
            Hệ thống AI tự chủ quản trị doanh nghiệp sáng tạo nội dung số
          </p>
        </div>

        {/* Auth Form Card */}
        <div className="rounded-2xl border border-zinc-800/90 bg-[#0c0e15] p-6 sm:p-8 shadow-2xl space-y-5">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[#07080d] rounded-xl border border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setError("");
                setSuccessMsg("");
              }}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === "signin"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5 inline mr-1.5" />
              Đăng Nhập
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("signup");
                setError("");
                setSuccessMsg("");
              }}
              className={`py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                mode === "signup"
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <UserPlus className="h-3.5 w-3.5 inline mr-1.5" />
              Tạo Tài Khoản
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
              <span>Email quản trị</span>
              <Input
                type="email"
                autoComplete="username"
                required
                maxLength={320}
                placeholder="admin@emmi.local hoặc email cá nhân"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="bg-[#08090e] border-zinc-800 focus-visible:ring-emerald-500 h-10 text-sm text-slate-100 placeholder:text-slate-600"
              />
            </label>

            <label className="block space-y-1.5 text-xs font-semibold text-slate-300">
              <span>Mật khẩu</span>
              <Input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                maxLength={256}
                placeholder="Tối thiểu 6 ký tự"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="bg-[#08090e] border-zinc-800 focus-visible:ring-emerald-500 h-10 text-sm text-slate-100 placeholder:text-slate-600"
              />
            </label>

            {error && (
              <div role="alert" className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-300 leading-relaxed">
                {error}
              </div>
            )}

            {successMsg && (
              <div role="status" className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300 leading-relaxed">
                {successMsg}
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/25 cursor-pointer"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                "Đang xử lý..."
              ) : mode === "signin" ? (
                <>
                  Đăng Nhập Quản Trị <ArrowRight className="h-4 w-4 ml-1.5" />
                </>
              ) : (
                <>
                  Tạo Tài Khoản Admin <Sparkles className="h-4 w-4 ml-1.5" />
                </>
              )}
            </Button>
          </form>

          {/* Dev Mode Instant Access */}
          <div className="pt-3 border-t border-zinc-800/80">
            <button
              type="button"
              onClick={() => {
                window.location.href = "/admin";
              }}
              className="w-full py-2.5 px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800/90 border border-zinc-800 text-slate-300 hover:text-emerald-400 text-xs font-medium flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Vào thẳng Admin (Chế độ Nhà phát triển)</span>
            </button>
            <p className="text-[11px] text-slate-500 text-center mt-2 font-mono">
              Tự động gán quyền Super Admin trong môi trường kiểm thử
            </p>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center">
          <Link
            href="/"
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors inline-flex items-center gap-1"
          >
            ← Quay lại trang tổng quan công khai
          </Link>
        </div>
      </div>
    </main>
  );
}
