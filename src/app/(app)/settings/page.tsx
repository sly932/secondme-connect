"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Settings {
  hasApiKey: boolean;
  apiKeyPreview: string | null;
  newApiKey?: string | null;
}

export default function SettingsPage() {
  const { status } = useSession();
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [freshApiKey, setFreshApiKey] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-black pt-24 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-gray-900 dark:border-white border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black pt-24 px-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">设置</h1>

        {/* API Key */}
        <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">API Key</h2>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            用于调用 Connect 开放 API。请妥善保管，不要泄露给他人。
          </p>

          <div className="flex items-center gap-3">
            <div className="flex-1 px-4 py-3 bg-gray-50 dark:bg-zinc-800 rounded-lg font-mono text-sm text-gray-700 dark:text-zinc-300 overflow-hidden">
              {showKey && freshApiKey
                ? freshApiKey
                : settings.hasApiKey
                ? settings.apiKeyPreview
                : "尚未生成 API Key"}
            </div>
            <button
              onClick={() => setShowKey((value) => !value)}
              disabled={!freshApiKey}
              className="px-3 py-3 bg-gray-100 dark:bg-zinc-800 rounded-lg text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-40"
            >
              {showKey ? "隐藏" : "显示一次"}
            </button>
            <button
              onClick={copyApiKey}
              disabled={!freshApiKey}
              className="px-3 py-3 bg-gray-100 dark:bg-zinc-800 rounded-lg text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-40"
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>

          <p className="text-xs text-gray-400 dark:text-zinc-500">
            出于安全原因，完整 API Key 只会在生成或重新生成后显示一次。
          </p>

          <button
            onClick={() => setShowConfirm(true)}
            disabled={saving}
            className="px-4 py-2 bg-red-50 dark:bg-red-900/50 text-red-600 dark:text-red-300 text-sm rounded-lg hover:bg-red-100 dark:hover:bg-red-900/70 transition-colors border border-red-200 dark:border-red-800/50 disabled:opacity-50"
          >
            重新生成 API Key
          </button>
        </div>
      </div>

      {/* 确认弹窗 */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-sm"
            onClick={() => setShowConfirm(false)}
          />
          <div className="relative w-full max-w-sm mx-4 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">重新生成 API Key</h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mt-1">
                  旧的 API Key 将立即失效，所有使用该 Key 的应用将无法访问。
                </p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800 rounded-xl hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  updateSettings({ regenerateApiKey: true });
                }}
                disabled={saving}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                确认生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
