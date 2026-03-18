"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect } from "react";
import { useUserStore } from "@/lib/store";

export function Navbar() {
  const { data: session } = useSession();
  const { setUser, clearUser, isLoggedIn, credits } = useUserStore();

  useEffect(() => {
    if (session?.user) {
      setUser({
        id: session.user.id,
        name: session.user.name || "User",
        avatar: session.user.avatar,
        credits: session.user.credits,
        apiKey: session.user.apiKey,
      });
    } else {
      clearUser();
    }
  }, [session, setUser, clearUser]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-black/80 backdrop-blur-md border-b border-zinc-800">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-white tracking-tight">
          Connect
        </Link>

        <div className="flex items-center gap-6">
          {isLoggedIn ? (
            <>
              <Link href="/games" className="text-sm text-zinc-400 hover:text-white transition-colors">
                游戏广场
              </Link>
              <Link href="/tasks" className="text-sm text-zinc-400 hover:text-white transition-colors">
                我的任务
              </Link>
              <Link href="/profile" className="text-sm text-zinc-400 hover:text-white transition-colors">
                个人主页
              </Link>
              <Link href="/settings" className="text-sm text-zinc-400 hover:text-white transition-colors">
                设置
              </Link>
              <span className="text-sm text-zinc-500">
                {credits} credit
              </span>
              <button
                onClick={() => signOut()}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                退出
              </button>
            </>
          ) : (
            <button
              onClick={() => window.location.href = "/api/auth/login"}
              className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors"
            >
              登录
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
