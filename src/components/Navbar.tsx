"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect } from "react";
import { useUserStore, useThemeStore } from "@/lib/store";

export function Navbar() {
  const { data: session } = useSession();
  const { setUser, clearUser, isLoggedIn, credits } = useUserStore();
  const { theme, toggleTheme } = useThemeStore();

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
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
          Connect
        </Link>

        <div className="flex items-center gap-6">
          {isLoggedIn ? (
            <>
              <Link href="/plaza" className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                广场
              </Link>
              <Link href="/games" className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                游戏
              </Link>
              <Link href="/tasks" className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                任务
              </Link>
              <Link href="/profile" className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                个人主页
              </Link>
              <Link href="/settings" className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                设置
              </Link>
              <span className="text-sm text-gray-400 dark:text-zinc-500">
                {credits} credit
              </span>
              <button
                onClick={() => signOut()}
                className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                退出
              </button>
            </>
          ) : (
            <button
              onClick={() => window.location.href = "/api/auth/login"}
              className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors"
            >
              登录
            </button>
          )}

          {/* 主题切换 */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            title={theme === "light" ? "切换到夜间模式" : "切换到白天模式"}
          >
            {theme === "light" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </nav>
  );
}
