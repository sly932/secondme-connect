"use client";

import { useState } from "react";
import { useDialogStore } from "@/lib/store";

export function ConnectDialog() {
  const { isOpen, activeTab, close, setTab } = useDialogStore();
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"WRITING" | "PAINTING">("WRITING");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!description.trim()) return;
    setLoading(true);
    setResult(null);

    try {
      const endpoint = activeTab === "consult" ? "/api/v1/consult" : "/api/v1/tasks";
      const body: Record<string, unknown> = { description };
      if (activeTab === "marketplace") {
        body.category = category;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: "请求失败" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />

      {/* Dialog */}
      <div className="relative w-full max-w-lg mx-4 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setTab("consult")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === "consult"
                  ? "bg-white text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              咨询任务
            </button>
            <button
              onClick={() => setTab("marketplace")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === "marketplace"
                  ? "bg-white text-black"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              任务市场
            </button>
          </div>
          <button onClick={close} className="text-zinc-400 hover:text-white transition-colors">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {activeTab === "marketplace" && (
            <div className="flex gap-3">
              <button
                onClick={() => setCategory("WRITING")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  category === "WRITING"
                    ? "border-white bg-white/10 text-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                写作任务 · 20 credit
              </button>
              <button
                onClick={() => setCategory("PAINTING")}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                  category === "PAINTING"
                    ? "border-white bg-white/10 text-white"
                    : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                绘画任务 · 30 credit
              </button>
            </div>
          )}

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              activeTab === "consult"
                ? "描述你想咨询的问题，系统会为你匹配最合适的分身..."
                : "描述你的任务需求..."
            }
            className="w-full h-32 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 resize-none focus:outline-none focus:border-zinc-500 transition-colors"
          />

          {/* Result */}
          {result && (
            <div className="bg-zinc-800 rounded-xl p-4 text-sm text-zinc-300 max-h-48 overflow-auto">
              <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={loading || !description.trim()}
            className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                匹配中...
              </span>
            ) : (
              "Connect"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
