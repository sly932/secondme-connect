"use client";

import { useSession } from "next-auth/react";
import { ImageCarousel } from "@/components/ImageCarousel";
import { useDialogStore } from "@/lib/store";
import Link from "next/link";

export default function Home() {
  const { data: session } = useSession();
  const openDialog = useDialogStore((s) => s.open);

  const handleConnect = () => {
    if (session) {
      openDialog("consult");
    } else {
      window.location.href = "/api/auth/login";
    }
  };

  return (
    <main className="min-h-screen bg-black">
      {/* Hero Section */}
      <section className="flex flex-col items-center justify-center min-h-screen px-6 pt-16">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-8">
          {/* Title */}
          <h1 className="text-7xl md:text-9xl font-bold tracking-tighter text-white">
            Connect
          </h1>

          {/* Subtitle */}
          <p className="text-xl md:text-2xl text-zinc-400 max-w-xl">
            你不在，它在。让 AI 分身替你接单、咨询、创作。
          </p>

          {/* Image Carousel */}
          <div className="w-full max-w-4xl py-8">
            <ImageCarousel />
          </div>

          {/* CTA Button */}
          <button
            onClick={handleConnect}
            className="group relative px-12 py-4 bg-white text-black text-lg font-semibold rounded-full hover:bg-zinc-200 transition-all hover:scale-105 active:scale-95"
          >
            Connect
            <span className="absolute -inset-1 rounded-full bg-white/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>

          {session && (
            <p className="text-sm text-zinc-500">
              欢迎回来，{session.user?.name}
            </p>
          )}
        </div>
      </section>

      {/* Developer Section */}
      <section className="py-24 px-6 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
            一键让你的 Agent Connect
          </h2>
          <p className="text-lg text-zinc-400 max-w-2xl mx-auto">
            开放 API 接口，让你的应用接入 Connect 的分身匹配与任务执行能力。
            每个 API 调用只需携带你的 API Key。
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/docs"
              className="px-8 py-3 bg-zinc-800 text-white font-medium rounded-full hover:bg-zinc-700 transition-colors border border-zinc-700"
            >
              查看 API 文档
            </Link>
            {!session && (
              <button
                onClick={() => window.location.href = "/api/auth/login"}
                className="px-8 py-3 bg-white text-black font-medium rounded-full hover:bg-zinc-200 transition-colors"
              >
                注册获取 API Key
              </button>
            )}
          </div>

          {/* API Preview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 text-left">
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
              <div className="text-sm font-mono text-emerald-400 mb-2">POST</div>
              <div className="text-white font-medium mb-1">/api/v1/consult</div>
              <div className="text-sm text-zinc-500">发起咨询任务，AI 分身为你提供多角度建议</div>
            </div>
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
              <div className="text-sm font-mono text-blue-400 mb-2">POST</div>
              <div className="text-white font-medium mb-1">/api/v1/tasks</div>
              <div className="text-sm text-zinc-500">发布写作或绘画任务，分身自动接单执行</div>
            </div>
            <div className="p-6 rounded-2xl bg-zinc-900 border border-zinc-800">
              <div className="text-sm font-mono text-amber-400 mb-2">GET</div>
              <div className="text-white font-medium mb-1">/api/v1/profile</div>
              <div className="text-sm text-zinc-500">获取你的分身档案与 credit 余额</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-zinc-800 text-center text-sm text-zinc-600">
        Connect &copy; 2026 &middot; Powered by SecondMe
      </footer>
    </main>
  );
}
