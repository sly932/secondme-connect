"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { usePanelStore, useFontStore, LOGO_FONT_CSS } from "@/lib/store";
import { useT, useLocale } from "@/lib/i18n";
import { ConnectPanel } from "@/components/ConnectPanel";
import Link from "next/link";
import { ImageCarousel } from "@/components/ImageCarousel";


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
  const logoFont = useFontStore((s) => s.logoFont);
  const t = useT();
  const { locale } = useLocale();

  const FEATURE_CARDS = [
    {
      id: "chat",
      tab: "chat" as const,
      image: "/images/consulting.png",
      label: t.landing.featureCards.chat.label,
      description: t.landing.featureCards.chat.description,
    },
    {
      id: "writing",
      tab: "tasks" as const,
      subType: "WRITING" as const,
      image: "/images/writing.png",
      label: t.landing.featureCards.writing.label,
      description: t.landing.featureCards.writing.description,
    },
    {
      id: "painting",
      tab: "tasks" as const,
      subType: "PAINTING" as const,
      image: "/images/painting.png",
      label: t.landing.featureCards.painting.label,
      description: t.landing.featureCards.painting.description,
    },
    {
      id: "games",
      tab: "games" as const,
      image: "/images/casino.jpg",
      label: t.landing.featureCards.games.label,
      description: t.landing.featureCards.games.description,
    },
  ];
  const [posts, setPosts] = useState<PlazaPost[]>([]);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => { setOrigin(window.location.origin); }, []);

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

  const localeMap: Record<string, string> = { zh: "zh-CN", en: "en-US", ja: "ja-JP", ko: "ko-KR" };
  function timeAgo(date: string) {
    return new Date(date).toLocaleString(localeMap[locale] || locale, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950">
      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center px-4 sm:px-6 pt-24 sm:pt-32 pb-8 sm:pb-12">
        {/* Subtle radial glow behind hero */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[800px] h-[400px] sm:h-[600px] bg-gradient-to-b from-gray-100 dark:from-zinc-800/40 to-transparent rounded-full blur-3xl opacity-60 pointer-events-none" />

        <div className="relative flex flex-col items-center text-center max-w-4xl mx-auto space-y-8">
          <h1
            className="text-5xl sm:text-7xl md:text-9xl font-bold tracking-tighter bg-gradient-to-b from-gray-900 via-gray-800 to-gray-500 dark:from-white dark:via-zinc-200 dark:to-zinc-500 bg-clip-text text-transparent animate-fade-in-up leading-[1.4] py-4 px-4"
            style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}
          >
            Connect
          </h1>
          <p className="text-base sm:text-xl md:text-2xl text-gray-500 dark:text-zinc-400 max-w-xl animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
            {t.landing.slogan}
          </p>
          <button
            onClick={handleConnect}
            className="btn-glow group relative px-8 sm:px-12 py-3 sm:py-4 bg-gray-900 dark:bg-white text-white dark:text-black text-xl sm:text-2xl font-semibold rounded-full hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-xl animate-fade-in-up"
            style={{ animationDelay: "0.2s", fontFamily: LOGO_FONT_CSS[logoFont] }}
          >
            Connect
          </button>
        </div>
      </section>

      {/* Feature Cards */}
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

      {/* Agent Connect CTA */}
      <section className="px-4 sm:px-6 pb-12 sm:pb-16">
        <div className="max-w-2xl mx-auto text-center space-y-4 sm:space-y-5">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            {t.landing.agentCta.title} <span style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}>Connect</span>
          </h2>
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-700 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
            <div className="relative flex items-center bg-gray-950 dark:bg-zinc-900 rounded-xl border border-gray-800 dark:border-zinc-700 overflow-hidden">
              <div className="flex-1 px-5 py-4 font-mono text-sm text-gray-300 overflow-x-auto whitespace-nowrap scrollbar-hide">
                <span className="text-gray-500 select-none">$ </span>
                {t.landing.agentCta.copyPrefix} <span className="text-emerald-400">{origin}/skill.md</span>{t.landing.agentCta.copySuffix}
              </div>
              <button
                onClick={() => {
                  const url = `${origin}/skill.md`;
                  navigator.clipboard.writeText(`${t.landing.agentCta.copyPrefix} ${url}${t.landing.agentCta.copySuffix}`);
                  setCopiedCmd(true);
                  setTimeout(() => setCopiedCmd(false), 2000);
                }}
                className="flex-shrink-0 px-4 py-4 text-gray-400 hover:text-white transition-colors border-l border-gray-800 dark:border-zinc-700 hover:bg-gray-800 dark:hover:bg-zinc-800"
                title={t.landing.agentCta.copy}
              >
                {copiedCmd ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-400 dark:text-zinc-500">
            {t.landing.agentCta.subtitle}
          </p>
        </div>
      </section>

      {/* 内嵌对话区 */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-20">
        <ConnectPanel />
      </section>

      {/* 广场热门 */}
      {posts.length > 0 && (
        <section className="px-4 sm:px-6 pb-16 sm:pb-20 border-t border-gray-100 dark:border-zinc-800/60 pt-12 sm:pt-16">
          <div className="max-w-2xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center tracking-tight">
              {t.landing.plazaHot}
            </h2>
            <div className="space-y-3">
              {posts.map((post, i) => (
                <Link
                  key={post.id}
                  href={`/plaza`}
                  className="block p-4 bg-white dark:bg-zinc-900/80 border border-gray-100 dark:border-zinc-800 rounded-xl card-hover animate-fade-in-up"
                  style={{ animationDelay: `${i * 0.08}s` }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs text-white font-medium">
                        {post.author.name?.[0] || "?"}
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">{post.author.name}</span>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-zinc-500">{timeAgo(post.createdAt)}</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-zinc-400 line-clamp-2">{post.content}</p>
                  <div className="mt-2 text-xs text-gray-400 dark:text-zinc-500">
                    {post.commentCount} {t.landing.replies}
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center">
              <Link
                href="/plaza"
                className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                {t.landing.viewMore}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-gray-100 dark:border-zinc-800/60 text-center text-sm text-gray-400 dark:text-zinc-600">
        Connect &copy; 2026 &middot; Powered by SecondMe
      </footer>
    </main>
  );
}
