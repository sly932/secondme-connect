"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useFontStore, LOGO_FONT_CSS } from "@/lib/store";
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
  const router = useRouter();
  const logoFont = useFontStore((s) => s.logoFont);
  const t = useT();
  const { locale } = useLocale();
  const [panelOpen, setPanelOpen] = useState(false);

  // Transition states
  const [transitioning, setTransitioning] = useState(false);

  const FEATURE_CARDS = [
    {
      id: "chat",
      image: "/images/consulting.png",
      label: t.landing.featureCards.chat.label,
      description: t.landing.featureCards.chat.description,
    },
    {
      id: "writing",
      image: "/images/writing.png",
      label: t.landing.featureCards.writing.label,
      description: t.landing.featureCards.writing.description,
    },
    {
      id: "painting",
      image: "/images/painting.png",
      label: t.landing.featureCards.painting.label,
      description: t.landing.featureCards.painting.description,
    },
    {
      id: "games",
      image: "/images/casino.jpg",
      label: t.landing.featureCards.games.label,
      description: t.landing.featureCards.games.description,
    },
  ];
  const [posts, setPosts] = useState<PlazaPost[]>([]);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [origin, setOrigin] = useState("");

  // API Key state
  const [apiKeyPreview, setApiKeyPreview] = useState<string | null>(null);
  const [apiKeyFull, setApiKeyFull] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);


  useEffect(() => {
    if (session) {
      fetch("/api/v1/settings")
        .then((r) => r.json())
        .then((d) => { if (d.hasApiKey) setApiKeyPreview(d.apiKeyPreview); })
        .catch(() => {});
    }
  }, [session]);

  const handleGenerateApiKey = async () => {
    if (!session) { window.location.href = "/api/auth/login"; return; }
    setApiKeyLoading(true);
    try {
      const res = await fetch("/api/v1/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerateApiKey: true }),
      });
      const data = await res.json();
      if (data.newApiKey) {
        setApiKeyFull(data.newApiKey);
        setApiKeyPreview(data.apiKeyPreview);
        setShowApiKey(true);
      }
    } catch {}
    setApiKeyLoading(false);
  };

  const copyApiKey = () => {
    const key = showApiKey && apiKeyFull ? apiKeyFull : apiKeyPreview;
    if (key) {
      navigator.clipboard.writeText(key);
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    }
  };

  useEffect(() => {
    fetch("/api/v1/plaza?limit=3")
      .then((r) => r.json())
      .then((d) => { if (d.success) setPosts(d.posts); })
      .catch(() => {});
  }, []);

  const openPanel = () => {
    if (!session) {
      setShowLoginModal(true);
      return;
    }
    setPanelOpen(true);
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

  // ---- Transition: ConnectPanel finished matching ----
  const handleAllReady = useCallback((postId: string | null) => {
    setTransitioning(true);
    setTimeout(() => {
      router.push(postId ? `/feed?expand=${postId}` : "/feed");
    }, 600);
  }, [router]);

  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950">
      {/* ---- Surrounding content (slides out left when transitioning) ---- */}
      <div
        className={`transition-all duration-500 ease-in-out ${
          transitioning ? "opacity-0 -translate-x-full pointer-events-none" : "opacity-100 translate-x-0"
        }`}
      >
        {/* Hero */}
        <section className="relative flex flex-col items-center justify-center px-4 sm:px-6 pt-24 sm:pt-32 pb-8 sm:pb-12">
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
            {!panelOpen && (
              <button
                onClick={openPanel}
                className="btn-glow group relative px-8 sm:px-12 py-3 sm:py-4 bg-gray-900 dark:bg-white text-white dark:text-black text-xl sm:text-2xl font-semibold rounded-full hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all duration-300 hover:scale-105 active:scale-95 hover:shadow-xl animate-fade-in-up"
                style={{ animationDelay: "0.2s", fontFamily: LOGO_FONT_CSS[logoFont] }}
              >
                Connect
              </button>
            )}
          </div>
        </section>

        {/* Feature Cards */}
        {!panelOpen && (
          <>
            <section className="pb-16">
              <ImageCarousel
                cards={FEATURE_CARDS.map((card) => ({
                  id: card.id,
                  image: card.image,
                  label: card.label,
                  description: card.description,
                  onClick: () => openPanel(),
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

            {/* API Key CTA */}
            <section className="px-4 sm:px-6 pb-12 sm:pb-16">
              <div className="max-w-2xl mx-auto text-center space-y-4 sm:space-y-5">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                  {t.landing.apiKeyCta.title}
                </h2>
                <div className="relative group">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-zinc-700 dark:via-zinc-600 dark:to-zinc-700 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
                  <div className="relative flex items-center bg-gray-950 dark:bg-zinc-900 rounded-xl border border-gray-800 dark:border-zinc-700 overflow-hidden">
                    <div className="flex-1 px-5 py-4 font-mono text-sm text-gray-300 overflow-x-auto whitespace-nowrap scrollbar-hide">
                      {!session ? (
                        <span className="text-gray-500">{t.landing.apiKeyCta.loginFirst}</span>
                      ) : apiKeyPreview ? (
                        showApiKey && apiKeyFull ? apiKeyFull : apiKeyPreview
                      ) : (
                        <span className="text-gray-500">ck-••••••••••••••••</span>
                      )}
                    </div>
                    {session && apiKeyPreview && (
                      <>
                        <button onClick={() => setShowApiKey((v) => !v)} disabled={!apiKeyFull} className="flex-shrink-0 px-4 py-4 text-gray-400 hover:text-white transition-colors border-l border-gray-800 dark:border-zinc-700 hover:bg-gray-800 dark:hover:bg-zinc-800 disabled:opacity-40">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {showApiKey ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></> : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>}
                          </svg>
                        </button>
                        <button onClick={copyApiKey} className="flex-shrink-0 px-4 py-4 text-gray-400 hover:text-white transition-colors border-l border-gray-800 dark:border-zinc-700 hover:bg-gray-800 dark:hover:bg-zinc-800">
                          {copiedKey ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><polyline points="20 6 9 17 4 12" /></svg>
                          ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {!session ? (
                  <button onClick={() => setShowLoginModal(true)} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-semibold rounded-full hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all duration-200 active:scale-95">
                    {t.landing.loginModal.btn}
                  </button>
                ) : (
                  <button onClick={handleGenerateApiKey} disabled={apiKeyLoading} className="px-6 py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-semibold rounded-full hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all duration-200 active:scale-95 disabled:opacity-50">
                    {apiKeyLoading ? "..." : apiKeyPreview ? t.landing.apiKeyCta.regenerate : t.landing.apiKeyCta.generate}
                  </button>
                )}
                <p className="text-sm text-gray-400 dark:text-zinc-500">{t.landing.apiKeyCta.subtitle}</p>
              </div>
            </section>

            {/* Plaza hot posts */}
            {posts.length > 0 && (
              <section className="px-4 sm:px-6 pb-16 sm:pb-20 border-t border-gray-100 dark:border-zinc-800/60 pt-12 sm:pt-16">
                <div className="max-w-2xl mx-auto space-y-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white text-center tracking-tight">{t.landing.plazaHot}</h2>
                  <div className="space-y-3">
                    {posts.map((post, i) => (
                      <Link key={post.id} href="/feed" className="block p-4 bg-white dark:bg-zinc-900/80 border border-gray-100 dark:border-zinc-800 rounded-xl card-hover animate-fade-in-up" style={{ animationDelay: `${i * 0.08}s` }}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xs text-white font-medium">{post.author.name?.[0] || "?"}</div>
                            <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">{post.author.name}</span>
                          </div>
                          <span className="text-xs text-gray-400 dark:text-zinc-500">{timeAgo(post.createdAt)}</span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-zinc-400 line-clamp-2">{post.content}</p>
                        <div className="mt-2 text-xs text-gray-400 dark:text-zinc-500">{post.commentCount} {t.landing.replies}</div>
                      </Link>
                    ))}
                  </div>
                  <div className="text-center">
                    <Link href="/feed" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                      {t.landing.viewMore}
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    </Link>
                  </div>
                </div>
              </section>
            )}

            <footer className="py-8 px-6 border-t border-gray-100 dark:border-zinc-800/60 text-center text-sm text-gray-400 dark:text-zinc-600">
              Connect &copy; 2026 &middot; Powered by SecondMe
            </footer>
          </>
        )}
      </div>

      {/* ---- Connect Panel with line-draw animation ---- */}
      {panelOpen && (
        <div
          className={`transition-all duration-500 ease-in-out ${
            transitioning
              ? "fixed top-0 left-0 right-0 pt-20 px-4 sm:px-6 z-30"
              : "px-4 sm:px-6 -mt-4"
          }`}
        >
          <div className="w-full max-w-2xl mx-auto relative">
            {/* SVG 画线动画：两条路径从顶部中心同时出发 */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-10"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ animation: 'drawPathFadeOut 0.3s ease-out 0.9s forwards' }}
            >
              <path
                d="M 50,0 L 100,0 L 100,100 L 50,100"
                pathLength="1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                className="text-gray-300 dark:text-zinc-600"
                style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: 'drawPath 0.8s ease-out forwards' }}
              />
              <path
                d="M 50,0 L 0,0 L 0,100 L 50,100"
                pathLength="1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                className="text-gray-300 dark:text-zinc-600"
                style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: 'drawPath 0.8s ease-out forwards' }}
              />
            </svg>

            <div style={{ animation: 'panelContentReveal 0.4s ease-out 0.65s both' }}>
              <ConnectPanel onAllReady={handleAllReady} />
            </div>

            {!transitioning && (
              <button
                onClick={() => setPanelOpen(false)}
                className="mt-3 text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors mx-auto block"
                style={{ animation: 'panelContentReveal 0.3s ease-out 1s both' }}
              >
                {t.landing.loginModal.cancel || "收起"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px] animate-fade-in" onClick={() => setShowLoginModal(false)} />
          <div className="relative w-full max-w-xs mx-4 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200/80 dark:border-zinc-800 shadow-2xl overflow-hidden animate-scale-in">
            <div className="px-6 pt-8 pb-6 flex flex-col items-center text-center">
              <h3 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white" style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}>Connect</h3>
              <p className="mt-2 text-sm text-gray-400 dark:text-zinc-500 leading-relaxed">{t.landing.loginModal.desc}</p>
            </div>
            <div className="px-6 pb-6 space-y-2.5">
              <button onClick={() => { window.location.href = "/api/auth/login"; }} className="btn-glow w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98]">{t.landing.loginModal.btn}</button>
              <button onClick={() => setShowLoginModal(false)} className="w-full py-2.5 text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors">{t.landing.loginModal.cancel}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
