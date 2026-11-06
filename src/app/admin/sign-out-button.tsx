"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AdminSignOutButton() {
  const router = useRouter();

  async function signOut() {
    const { error } = await createClient().auth.signOut();
    if (error) {
      console.error("[AdminAuth] Sign-out failed:", error);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded border border-zinc-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-zinc-800"
    >
      Đăng xuất
    </button>
  );
}
