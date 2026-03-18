"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Settings {
  orderMode: "AUTO" | "MANUAL";
  autoTopN: number;
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

        {/* 下单模式 */}
        <div className="p-6 rounded-2xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">下单模式</h2>
          <div className="flex gap-3">
            <button
              onClick={() => updateSettings({ orderMode: "AUTO" })}
              disabled={saving}
              className={`flex-1 p-4 rounded-xl border text-left transition-all ${
                settings.orderMode === "AUTO"
                  ? "border-black dark:border-white bg-black/5 dark:bg-white/10"
                  : "border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500"
              }`}
            >
              <div className="font-medium text-gray-900 dark:text-white">自动模式</div>
              <div className="text-sm text-gray-500 dark:text-zinc-400 mt-1">匹配后自动执行，无需确认</div>
            </button>
            <button
              onClick={() => updateSettings({ orderMode: "MANUAL" })}
              disabled={saving}
              className={`flex-1 p-4 rounded-xl border text-left transition-all ${
                settings.orderMode === "MANUAL"
                  ? "border-black dark:border-white bg-black/5 dark:bg-white/10"
                  : "border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500"
              }`}
            >
              <div className="font-medium text-gray-900 dark:text-white">手动模式</div>
              <div className="text-sm text-gray-500 dark:text-zinc-400 mt-1">展示候选列表，手动选择</div>
            </button>
          </div>

          {settings.orderMode === "AUTO" && (
            <div>
              <label className="text-sm text-gray-500 dark:text-zinc-400">自动匹配数量 (Top N)</label>
              <div className="flex gap-2 mt-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => updateSettings({ autoTopN: n })}
                    disabled={saving}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
                      settings.autoTopN === n
                        ? "bg-black dark:bg-white text-white dark:text-black"
                        : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

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
              className="px-3 py-3 bg-gray-100 dark:bg-zinc-800 rounded-lg text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {showKey ? "隐藏" : "显示一次"}
            </button>
            <button
              onClick={copyApiKey}
              disabled={!freshApiKey}
              className="px-3 py-3 bg-gray-100 dark:bg-zinc-800 rounded-lg text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              {copied ? "已复制" : "复制"}
            </button>
          </div>

          <p className="text-xs text-gray-400 dark:text-zinc-500">
            出于安全原因，完整 API Key 只会在生成或重新生成后显示一次。
          </p>

          <button
            onClick={() => {
              if (confirm("重新生成后，旧的 API Key 将立即失效。确认继续？")) {
                updateSettings({ regenerateApiKey: true });
              }
            }}
            disabled={saving}
            className="px-4 py-2 bg-red-50 dark:bg-red-900/50 text-red-600 dark:text-red-300 text-sm rounded-lg hover:bg-red-100 dark:hover:bg-red-900/70 transition-colors border border-red-200 dark:border-red-800/50"
          >
            重新生成 API Key
          </button>
        </div>
      </div>
    </div>
  );
}
