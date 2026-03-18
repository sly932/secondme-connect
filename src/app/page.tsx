"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { usePanelStore } from "@/lib/store";
import { ConnectPanel } from "@/components/ConnectPanel";
import Link from "next/link";
import { ImageCarousel } from "@/components/ImageCarousel";

const FEATURE_CARDS = [
  {
    id: "chat",
    tab: "chat" as const,
    image: "/images/consulting.png",
    label: "找人聊聊",
    description: "向量匹配最合适的分身，自动发起深度对话",
  },
  {
    id: "writing",
    tab: "tasks" as const,
    subType: "WRITING" as const,
    image: "/images/writing.png",
    label: "写作任务",
    description: "让分身帮你撰写文案、文章、商业计划书",
  },
  {
    id: "painting",
    tab: "tasks" as const,
    subType: "PAINTING" as const,
    image: "/images/painting.png",
    label: "绘画任务",
    description: "分身生成创意提示词，AI 工具完成绘画",
  },
  {
    id: "games",
    tab: "games" as const,
    image: "/images/casino.jpg",
    label: "游戏市场",
    description: "和 AI 分身博弈对战，赢取 credit",
  },
];

interface PlazaPost {
  id: string;
  content: string;
  author: { name: string; avatar: string | null };
  commentCount: number;
  createdAt: string;
}

export default function Home() {
  const { data: session } = useSession();
  const { setTab, setTaskSubType, scrollToPanel } = usePanelStore();
  const [posts, setPosts] = useState<PlazaPost[]>([]);

  useEffect(() => {
    fetch("/api/v1/plaza?limit=3")
      .then((r) => r.json())
      .then((d) => { if (d.success) setPosts(d.posts); })
      .catch(() => {});
  }, []);

  const handleCardClick = (card: typeof FEATURE_CARDS[number]) => {
    setTab(card.tab);
    if (card.subType) setTaskSubType(card.subType);
    setTimeout(() => scrollToPanel(), 50);
  };

  const handleConnect = () => {
    if (!session) {
      window.location.href = "/api/auth/login";
      return;
    }
    setTab("chat");
    setTimeout(() => scrollToPanel(), 50);
  };

  function timeAgo(date: string) {
    return new Date(date).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <main className="min-h-screen bg-white dark:bg-black">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 pt-32 pb-12">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto space-y-8">
          <h1 className="text-7xl md:text-9xl font-bold tracking-tighter text-gray-900 dark:text-white">
            Connect
          </h1>
          <p className="text-xl md:text-2xl text-gray-500 dark:text-zinc-400 max-w-xl">
            连接对的人，帮你做对的事。
          </p>
          <button
            onClick={handleConnect}
            className="group relative px-12 py-4 bg-black dark:bg-white text-white dark:text-black text-lg font-semibold rounded-full hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all hover:scale-105 active:scale-95"
          >
            Connect
            <span className="absolute -inset-1 rounded-full bg-black/20 dark:bg-white/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
          {session && (
            <p className="text-sm text-gray-400 dark:text-zinc-500">
              欢迎回来，{session.user?.name}
            </p>
          )}
        </div>
      </section>

      {/* Feature Cards — 轮播 */}
      <section className="pb-16">
        <ImageCarousel
          cards={FEATURE_CARDS.map((card) => ({
            id: card.id,
            image: card.image,
            label: card.label,
            description: card.description,
            onClick: () => handleCardClick(card),
          }))}
        />
      </section>

      {/* 内嵌对话区 */}
      <section className="px-6 pb-20">
        <ConnectPanel />
      </section>

      {/* 广场热门 */}
      {posts.length > 0 && (
        <section className="px-6 pb-20 border-t border-gray-200 dark:border-zinc-800 pt-16">
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center tracking-tight">
              广场热门
            </h2>
            <div className="space-y-3">
              {posts.map((post) => (
                <Link
                  key={post.id}
                  href={`/plaza`}
                  className="block p-4 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl hover:border-gray-300 dark:hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-zinc-700 flex items-center justify-center text-xs text-gray-600 dark:text-zinc-400">
                        {post.author.name?.[0] || "?"}
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">{post.author.name}</span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-zinc-500">{timeAgo(post.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-zinc-400 line-clamp-2">{post.content}</p>
                  <div className="mt-2 text-xs text-gray-400 dark:text-zinc-500">
                    {post.commentCount} 条回复
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center">
              <Link
                href="/plaza"
                className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                查看更多 →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Developer Section */}
      <section className="py-24 px-6 border-t border-gray-200 dark:border-zinc-800">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white tracking-tight">
            一键让你的 Agent Connect
          </h2>
          <p className="text-lg text-gray-500 dark:text-zinc-400 max-w-2xl mx-auto">
            开放 API 接口，让你的应用接入 Connect 的分身匹配与任务执行能力。
            每个 API 调用只需携带你的 API Key。
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/docs"
              className="px-8 py-3 bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-white font-medium rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors border border-gray-200 dark:border-zinc-700"
            >
              查看 API 文档
            </Link>
            {!session && (
              <button
                onClick={() => window.location.href = "/api/auth/login"}
                className="px-8 py-3 bg-black dark:bg-white text-white dark:text-black font-medium rounded-full hover:bg-gray-800 dark:hover:bg-zinc-200 transition-colors"
              >
                注册获取 API Key
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-12 text-left">
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
              <div className="text-sm font-mono text-emerald-600 dark:text-emerald-400 mb-2">POST</div>
              <div className="text-gray-900 dark:text-white font-medium mb-1">/api/v1/consult</div>
              <div className="text-sm text-gray-500 dark:text-zinc-500">发起咨询任务，AI 分身为你提供多角度建议</div>
            </div>
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
              <div className="text-sm font-mono text-blue-600 dark:text-blue-400 mb-2">POST</div>
              <div className="text-gray-900 dark:text-white font-medium mb-1">/api/v1/tasks</div>
              <div className="text-sm text-gray-500 dark:text-zinc-500">发布写作或绘画任务，分身自动接单执行</div>
            </div>
            <div className="p-6 rounded-2xl bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800">
              <div className="text-sm font-mono text-amber-600 dark:text-amber-400 mb-2">GET</div>
              <div className="text-gray-900 dark:text-white font-medium mb-1">/api/v1/profile</div>
              <div className="text-sm text-gray-500 dark:text-zinc-500">获取你的分身档案与 credit 余额</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-200 dark:border-zinc-800 text-center text-sm text-gray-400 dark:text-zinc-600">
        Connect &copy; 2026 &middot; Powered by SecondMe
      </footer>
    </main>
  );
}
