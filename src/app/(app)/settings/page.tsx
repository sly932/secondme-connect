"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useFontStore, LOGO_FONTS, getFontCssByIndex } from "@/lib/store";
import { Tooltip } from "@/components/Tooltip";
import { useT } from "@/lib/i18n";

interface Settings {
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  newApiKey?: string | null;
}

type SectionId = "appearance" | "api";

export default function SettingsPage() {
  const t = useT();

  const SECTIONS = [
    {
      id: "appearance" as const,
      label: t.settings.appearance,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ),
    },
    {
      id: "api" as const,
      label: t.settings.api,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
  ];
  const { status } = useSession();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [freshApiKey, setFreshApiKey] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("appearance");

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { fontIndex, setFontIndex } = useFontStore();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      fetch("/api/v1/settings")
        .then((r) => r.json())
        .then(setSettings)
        .finally(() => setLoading(false));
    }
  }, [status, router]);

  // 滚动时高亮对应的侧栏项
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id as SectionId);
          }
        }
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: 0 }
    );

    for (const section of SECTIONS) {
      const el = sectionRefs.current[section.id];
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [loading]);

  const scrollToSection = (id: SectionId) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateSettings = async (data: Record<string, unknown>) => {
    setSaving(true);
    const res = await fetch("/api/v1/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const updated = await res.json();
    setSettings(updated);
    setFreshApiKey(updated.newApiKey || null);
    setShowKey(false);
    setSaving(false);
  };

  const copyApiKey = () => {
    if (freshApiKey) {
      navigator.clipboard.writeText(freshApiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (status === "loading") return null;

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-zinc-950 pt-24 px-6">
      <div className="max-w-4xl mx-auto flex gap-8">
        {/* 左侧导航 */}
        <aside className="hidden md:block w-48 flex-shrink-0">
          <div className="sticky top-28 space-y-1">
            <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-4 px-3">{t.settings.title}</h1>
            {SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  onClick={() => scrollToSection(section.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-gray-900 dark:bg-white text-white dark:text-black"
                      : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800/80"
                  }`}
                >
                  <span className={isActive ? "opacity-100" : "opacity-60"}>{section.icon}</span>
                  {section.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* 移动端标题 */}
        <div className="md:hidden absolute top-24 left-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t.settings.title}</h1>
        </div>

        {/* 右侧内容 */}
        <main className="flex-1 min-w-0 space-y-8 md:pt-0 pt-12 pb-16">
          {/* 外观 */}
          <div
            id="appearance"
            ref={(el) => { sectionRefs.current.appearance = el; }}
            className="scroll-mt-28"
          >
            <h2 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-4 px-1">{t.settings.appearance}</h2>

            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800 space-y-4 animate-fade-in-up">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-zinc-400">
                    <polyline points="4 7 4 4 20 4 20 7" />
                    <line x1="9" y1="20" x2="15" y2="20" />
                    <line x1="12" y1="4" x2="12" y2="20" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t.settings.logoFont}</h3>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">
                    {t.settings.logoFontDesc}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {LOGO_FONTS.map((font, idx) => {
                  const isActive = fontIndex === idx;
                  return (
                    <button
                      key={font.key}
                      onClick={() => setFontIndex(idx)}
                      className={`relative p-4 rounded-xl border text-left transition-all duration-200 group ${
                        isActive
                          ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-indigo-500/30"
                          : "border-gray-200 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/50 hover:border-gray-300 dark:hover:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {isActive && (
                        <div className="absolute top-2.5 right-2.5">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-indigo-500 dark:text-indigo-400">
                            <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15" />
                            <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      )}
                      <span
                        className="block text-2xl text-gray-900 dark:text-white mb-1"
                        style={{ fontFamily: getFontCssByIndex(idx) }}
                      >
                        Connect
                      </span>
                      <span className="text-xs text-gray-500 dark:text-zinc-400">
                        {font.label}
                        <span className="text-gray-400 dark:text-zinc-500 ml-1">· {t.settings.fontStyles[font.key] || font.style}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* API */}
          <div
            id="api"
            ref={(el) => { sectionRefs.current.api = el; }}
            className="scroll-mt-28"
          >
            <h2 className="text-xs font-semibold text-gray-400 dark:text-zinc-500 uppercase tracking-wider mb-4 px-1">{t.settings.api}</h2>

            <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800 space-y-4 animate-fade-in-up">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-zinc-800 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 dark:text-zinc-400">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t.settings.apiKeyTitle}</h3>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">
                    {t.settings.apiKeyDesc}
                  </p>
                </div>
              </div>

              {loading ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-11 rounded-xl bg-gray-100 dark:bg-zinc-800" />
                  <div className="w-56 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                  <div className="w-32 h-8 rounded-xl bg-gray-200 dark:bg-zinc-700" />
                </div>
              ) : settings && (<>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-4 py-3 bg-gray-50 dark:bg-zinc-800/80 rounded-xl font-mono text-sm text-gray-700 dark:text-zinc-300 overflow-hidden border border-gray-100 dark:border-zinc-700">
                  {saving ? (
                    <div className="h-5 w-48 rounded bg-gray-200 dark:bg-zinc-700 animate-shimmer" />
                  ) : showKey && freshApiKey
                    ? freshApiKey
                    : settings.hasApiKey
                    ? settings.apiKeyPreview
                    : t.settings.noApiKey}
                </div>
                <Tooltip text={showKey ? t.settings.hide : t.settings.showOnce}>
                  <button
                    onClick={() => setShowKey((value) => !value)}
                    disabled={!freshApiKey || saving}
                    className="p-2.5 bg-gray-100 dark:bg-zinc-800 rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-all duration-200 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-zinc-700"
                  >
                    {showKey ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </Tooltip>
                <Tooltip text={copied ? t.settings.copied : t.settings.copy}>
                  <button
                    onClick={copyApiKey}
                    disabled={!freshApiKey || saving}
                    className="p-2.5 bg-gray-100 dark:bg-zinc-800 rounded-xl text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-all duration-200 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-zinc-700"
                  >
                    {copied ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </Tooltip>
              </div>

              <p className="text-xs text-gray-400 dark:text-zinc-500">
                {t.settings.apiKeySecurityNote}
              </p>

              <button
                onClick={() => setShowConfirm(true)}
                disabled={saving}
                className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 text-sm font-medium rounded-xl hover:bg-red-100 dark:hover:bg-red-900/50 transition-all duration-200 border border-red-200 dark:border-red-800/50 disabled:opacity-50"
              >
                {t.settings.regenerateApiKey}
              </button>
              </>)}
            </div>
          </div>
        </main>
      </div>

      {/* 确认弹窗 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowConfirm(false)}
          />
          <div className="relative w-full max-w-sm mx-4 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-700 shadow-2xl p-6 space-y-4 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t.settings.regenerateConfirmTitle}</h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                  {t.settings.regenerateConfirmDesc}
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800 rounded-xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-all duration-200"
              >
                {t.settings.cancel}
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  updateSettings({ regenerateApiKey: true });
                }}
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-all duration-200 disabled:opacity-50"
              >
                {t.settings.confirmGenerate}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
