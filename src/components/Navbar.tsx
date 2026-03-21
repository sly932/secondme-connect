"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useEffect, useRef, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { usePathname } from "next/navigation";
import { useUserStore, useThemeStore, useFontStore, LOGO_FONT_CSS } from "@/lib/store";
import { useT, useLocale, type Locale } from "@/lib/i18n";

function Avatar({ name, avatar, size = 32 }: { name: string; avatar?: string | null; size?: number }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initial = (name || "?")[0].toUpperCase();
  return (
    <div
      className="rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-semibold text-xs"
      style={{ width: size, height: size }}
    >
      {initial}
    </div>
  );
}

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { setUser, clearUser, isLoggedIn, name, avatar, credits } = useUserStore();
  const { theme, toggleTheme } = useThemeStore();
  const { updateCredits } = useUserStore();
  const { logoFont, syncFromServer: syncFont } = useFontStore();
  const t = useT();

  const NAV_LINKS = [
    { href: "/feed", label: t.nav.feed },
    { href: "/games", label: t.nav.games },
  ];

  const { locale, setLocale } = useLocale();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error"; action?: () => void } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  // Portrait state
  const [portraitModalOpen, setPortraitModalOpen] = useState(false);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitLoading, setPortraitLoading] = useState(false);
  const [portraitFetched, setPortraitFetched] = useState(false);
  const [shareView, setShareView] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleSaveShareCard = useCallback(async () => {
    const el = shareCardRef.current;
    if (!el) return;
    try {
      const { saveShareImage } = await import("@/lib/save-share-image");
      await saveShareImage(el, `${name || "Connect"}-自画像.png`);
    } catch (err) {
      console.error("Save share card failed:", err);
    }
  }, [name]);

  const fetchPortrait = async () => {
    if (portraitFetched) return;
    try {
      const res = await fetch("/api/v1/portrait");
      if (res.ok) {
        const data = await res.json();
        if (data.portraitUrl) setPortraitUrl(data.portraitUrl);
      }
    } catch {}
    setPortraitFetched(true);
  };

  const handleOpenPortrait = () => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
    fetchPortrait();
    setPortraitModalOpen(true);
  };

  const handleGeneratePortrait = async () => {
    setPortraitLoading(true);
    setPortraitModalOpen(false); // 用户可以先关掉弹窗
    setToast({ message: t.nav.portraitGenerating, type: "success" });
    try {
      const res = await fetch("/api/v1/portrait", { method: "POST" });
      const data = await res.json();
      if (data.success && data.portraitUrl) {
        setPortraitUrl(data.portraitUrl);
        setToast({
          message: t.nav.portraitReady,
          type: "success",
          action: () => setPortraitModalOpen(true),
        });
        setTimeout(() => setToast(null), 5000);
      } else {
        setToast({ message: t.nav.portraitFailed, type: "error" });
        setTimeout(() => setToast(null), 3000);
      }
    } catch {
      setToast({ message: t.nav.portraitFailed, type: "error" });
      setTimeout(() => setToast(null), 3000);
    }
    setPortraitLoading(false);
  };

  const handleSyncProfile = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/v1/profile/sync", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.success) {
        setToast({ message: t.nav.syncProfileSuccess, type: "success" });
      } else {
        setToast({ message: data.message || t.nav.syncProfileFail, type: "error" });
      }
    } catch {
      setToast({ message: t.nav.syncProfileFail, type: "error" });
    }
    setSyncing(false);
    setTimeout(() => setToast(null), 2000);
  };

  useEffect(() => {
    if (session?.user) {
      setUser({
        id: session.user.id,
        name: session.user.name || "User",
        avatar: session.user.avatar,
        credits: session.user.credits,
      });
    } else {
      clearUser();
    }
  }, [session, setUser, clearUser]);

  useEffect(() => {
    if (!session?.user) return;
    let active = true;

    const refreshCredits = async () => {
      try {
        const res = await fetch("/api/v1/profile");
        if (res.ok) {
          const data = await res.json();
          if (active) {
            if (typeof data.credits === "number") updateCredits(data.credits);
            if (typeof data.fontIndex === "number") syncFont(data.fontIndex);
          }
        }
      } catch { /* ignore */ }
    };

    refreshCredits();
    const timer = setInterval(refreshCredits, 30000);
    return () => { active = false; clearInterval(timer); };
  }, [session?.user, updateCredits]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    };
    if (dropdownOpen || langOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen, langOpen]);

  const LOCALES: { key: Locale; label: string }[] = [
    { key: "zh", label: t.languages.zh },
    { key: "en", label: t.languages.en },
    { key: "ja", label: t.languages.ja },
    { key: "ko", label: t.languages.ko },
  ];

  const LanguageSwitcher = () => (
    <div className="relative" ref={langRef}>
      <button
        onClick={() => setLangOpen(!langOpen)}
        className="p-2 rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800/80 transition-all duration-200"
        title="Language"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      </button>
      {langOpen && (
        <div className="absolute right-0 mt-2 w-36 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 shadow-xl py-1 animate-slide-down z-50">
          {LOCALES.map((l) => (
            <button
              key={l.key}
              onClick={() => { setLocale(l.key); setLangOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors rounded-lg mx-0 ${
                locale === l.key
                  ? "text-gray-900 dark:text-white font-medium bg-gray-50 dark:bg-zinc-800"
                  : "text-gray-600 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-800"
              }`}
            >
              {l.label}
              {locale === l.key && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline ml-2 text-indigo-500">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const ThemeToggle = () => (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800/80 transition-all duration-200"
      title={theme === "light" ? t.nav.switchToDark : t.nav.switchToLight}
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
  );

  return (
    <>
    {/* Toast */}
    {toast && (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
        <div className={`px-5 py-2.5 rounded-xl text-sm font-medium shadow-lg backdrop-blur-sm border flex items-center gap-2 ${
          toast.type === "success"
            ? "bg-emerald-50/90 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50"
            : "bg-red-50/90 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/50"
        }`}>
          {toast.message}
          {toast.action && (
            <button
              onClick={() => { toast.action!(); setToast(null); }}
              className="underline font-semibold hover:opacity-80 transition-opacity"
            >
              {t.nav.portraitReadyClick}
            </button>
          )}
        </div>
      </div>
    )}

    {/* Portrait Modal */}
    {portraitModalOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px] animate-fade-in"
          onClick={() => { setPortraitModalOpen(false); setShareView(false); }}
        />
        <div className="relative w-full max-w-sm mx-4 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200/80 dark:border-zinc-800 shadow-2xl overflow-hidden animate-scale-in">
          {!shareView ? (
            /* === 自画像查看 === */
            <div className="p-6 flex flex-col items-center text-center space-y-4">
              <div className="w-64 h-64 rounded-xl overflow-hidden bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                {portraitUrl ? (
                  <img src={portraitUrl} alt="Self Portrait" className="w-full h-full object-cover" />
                ) : (
                  <div className="text-center space-y-2">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-gray-300 dark:text-zinc-600">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                    <p className="text-xs text-gray-400 dark:text-zinc-500">Pixel Art Portrait</p>
                  </div>
                )}
              </div>

              {!portraitUrl && !portraitLoading && (
                <button
                  onClick={handleGeneratePortrait}
                  className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98]"
                >
                  {t.nav.generatePortrait}
                </button>
              )}

              {portraitLoading && (
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-zinc-400">
                  <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                  {t.nav.portraitGenerating}
                </div>
              )}

              {/* 底部按钮栏 */}
              <div className="flex gap-2.5 w-full">
                <button
                  onClick={() => { setPortraitModalOpen(false); setShareView(false); }}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded-xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-all duration-200 active:scale-[0.98]"
                >
                  {t.nav.portraitClose}
                </button>
                {portraitUrl && (
                  <button
                    onClick={() => setShareView(true)}
                    className="flex items-center justify-center gap-1.5 flex-1 py-2.5 text-sm font-medium text-white dark:text-black bg-gray-900 dark:bg-white rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98]"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    {t.nav.portraitShare}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* === 分享卡片 === */
            <div className="flex flex-col items-center">
              <div ref={shareCardRef} className="w-full bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-zinc-900 dark:via-zinc-900 dark:to-zinc-800">
                {/* 卡片顶部 */}
                <div className="px-6 pt-6 pb-4 text-center">
                  <h3
                    className="text-xl font-bold text-gray-900 dark:text-white tracking-tight"
                    style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}
                  >
                    Connect
                  </h3>
                </div>

                {/* 肖像 */}
                <div className="px-6">
                  <div className="w-full aspect-square rounded-xl overflow-hidden shadow-lg">
                    {portraitUrl && (
                      <img src={portraitUrl} alt="Self Portrait" className="w-full h-full object-cover" />
                    )}
                  </div>
                </div>

                {/* 底部：文案 + 二维码 */}
                <div className="px-6 py-5 flex items-end justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 leading-relaxed">
                      {t.nav.portraitShareText}
                    </p>
                    <p className="mt-1 text-xs text-gray-400 dark:text-zinc-500">
                      {t.nav.portraitShareScan}
                    </p>
                  </div>
                  <div className="flex-shrink-0 bg-white rounded-lg p-1.5">
                    <QRCodeSVG value={siteUrl} size={64} level="M" />
                  </div>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="w-full px-6 py-4 flex gap-2.5 border-t border-gray-100 dark:border-zinc-800">
                <button
                  onClick={() => setShareView(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded-xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-all duration-200 active:scale-[0.98]"
                >
                  {t.nav.portraitBack}
                </button>
                <button
                  onClick={handleSaveShareCard}
                  className="flex items-center justify-center gap-1.5 flex-1 py-2.5 text-sm font-medium text-white dark:text-black bg-gray-900 dark:bg-white rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all duration-200 active:scale-[0.98]"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {t.nav.portraitSave}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
    <nav className="fixed top-0 left-0 right-0 z-40 bg-white/70 dark:bg-zinc-950/70 backdrop-blur-xl border-b border-gray-200/60 dark:border-zinc-800/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <Link
          href="/"
          className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight hover:opacity-80 transition-opacity"
          style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}
        >
          Connect
        </Link>

        <div className="flex items-center gap-1">
          {isLoggedIn ? (
            <>
              {/* Desktop nav links */}
              <div className="hidden sm:flex items-center gap-1">
                {NAV_LINKS.map((link) => {
                  const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                        isActive
                          ? "text-gray-900 dark:text-white bg-gray-100 dark:bg-zinc-800"
                          : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
                <div className="w-px h-5 bg-gray-200 dark:bg-zinc-800 mx-2" />
              </div>

              <LanguageSwitcher />
              <ThemeToggle />

              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="sm:hidden p-2 rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800/80 transition-all duration-200"
              >
                {mobileMenuOpen ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" />
                  </svg>
                )}
              </button>

              {/* Desktop avatar dropdown */}
              <div className="relative hidden sm:block" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 rounded-full hover:ring-2 hover:ring-gray-200 dark:hover:ring-zinc-700 transition-all ml-1"
                >
                  <Avatar name={name || "U"} avatar={avatar} size={34} />
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 shadow-xl py-1 animate-slide-down">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-zinc-800">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-500">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                        <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">{credits}</span>
                        <span className="text-xs text-gray-400 dark:text-zinc-500">credit</span>
                      </div>
                    </div>
                    <div className="py-1">
                      <Link href="/profile" onClick={() => setDropdownOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-lg mx-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        {t.nav.profile}
                      </Link>
                      <Link href="/settings" onClick={() => setDropdownOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-lg mx-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
                        {t.nav.settings}
                      </Link>
                      <Link href="/settings" onClick={() => setDropdownOpen(false)} className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-lg mx-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                        API Key
                      </Link>
                      <button
                        onClick={handleOpenPortrait}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-lg mx-1"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                        {t.nav.myPortrait}
                      </button>
                      <button
                        onClick={handleSyncProfile}
                        disabled={syncing}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors rounded-lg mx-1 disabled:opacity-50"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={syncing ? "animate-spin" : ""}><path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2" /></svg>
                        {t.nav.syncProfile}
                        {syncing && (
                          <svg className="animate-spin ml-auto" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" /></svg>
                        )}
                      </button>
                    </div>
                    <div className="border-t border-gray-100 dark:border-zinc-800 py-1">
                      <button onClick={() => { setDropdownOpen(false); signOut({ callbackUrl: "/" }); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors rounded-lg mx-1">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                        {t.nav.logout}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile avatar (no dropdown, just visible) */}
              <div className="sm:hidden ml-1">
                <Avatar name={name || "U"} avatar={avatar} size={30} />
              </div>
            </>
          ) : (
            <>
              <LanguageSwitcher />
              <ThemeToggle />
              <button
                onClick={() => window.location.href = "/api/auth/login"}
                className="ml-2 px-4 sm:px-5 py-1.5 sm:py-2 bg-gray-900 dark:bg-white text-white dark:text-black text-sm font-medium rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all duration-200 hover:shadow-md"
              >
                {t.nav.login}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mobile menu */}
      {isLoggedIn && mobileMenuOpen && (
        <div className="sm:hidden border-t border-gray-200/60 dark:border-zinc-800/60 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl animate-slide-down">
          <div className="px-4 py-3 space-y-1">
            {NAV_LINKS.map((link) => {
              const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "text-gray-900 dark:text-white bg-gray-100 dark:bg-zinc-800"
                      : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-zinc-800/50"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="border-t border-gray-100 dark:border-zinc-800 my-2" />
            <div className="flex items-center gap-1.5 px-3 py-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-500">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">{credits}</span>
              <span className="text-xs text-gray-400 dark:text-zinc-500">credit</span>
            </div>
            <Link href="/profile" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800">
              {t.nav.profile}
            </Link>
            <Link href="/settings" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800">
              {t.nav.settings}
            </Link>
            <button
              onClick={handleOpenPortrait}
              className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              {t.nav.myPortrait}
            </button>
            <button
              onClick={handleSyncProfile}
              disabled={syncing}
              className="w-full text-left flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              {t.nav.syncProfile}
              {syncing && (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" strokeOpacity="0.25" /><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" /></svg>
              )}
            </button>
            <button onClick={() => { setMobileMenuOpen(false); signOut({ callbackUrl: "/" }); }} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
              {t.nav.logout}
            </button>
          </div>
        </div>
      )}
    </nav>
    </>
  );
}
