"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePanelStore, useUserStore } from "@/lib/store";
import type { PanelTab } from "@/lib/store";

const GAME_PRESETS = {
  BLACKJACK: { label: "21 点", icon: "🃏", players: 3, chips: 10, rounds: 5, cost: 50 },
  TEXAS_HOLDEM: { label: "德州扑克", icon: "♠️", players: 4, chips: 10, rounds: 5, cost: 50 },
} as const;

const CHAT_CHIPS = [
  "如何推广产品？",
  "怎么写商业计划书？",
  "如何做用户增长？",
  "技术架构选型建议？",
  "融资 pitch 要点有哪些？",
];

const WRITING_CHIPS = [
  "写一篇产品介绍文案",
  "帮我润色这段文字",
  "写一封商务邀请函",
];

const PAINTING_CHIPS = [
  "画一个 Logo",
  "像素风格的小人头像",
  "赛博朋克城市夜景",
];

const TABS: { key: PanelTab; label: string }[] = [
  { key: "chat", label: "找人聊聊" },
  { key: "tasks", label: "发布任务" },
  { key: "games", label: "游戏市场" },
];

export function ConnectPanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const { activeTab, taskSubType, setTab, setTaskSubType } = usePanelStore();
  const credits = useUserStore((s) => s.credits);

  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [creatingGame, setCreatingGame] = useState<string | null>(null);
  const pendingRoomId = useRef<string | null>(null);

  const hasCredits = credits > 0;

  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };

  const handleChatSubmit = async () => {
    if (!session) return handleLogin();
    if (!description.trim()) return;

    if (!hasCredits) {
      // 发到广场
      setLoading(true);
      try {
        const res = await fetch("/api/v1/plaza", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: description }),
        });
        const data = await res.json();
        if (data.success) {
          setDescription("");
          router.push("/plaza");
        } else {
          setResult({ error: data.message || "发布失败" });
        }
      } catch {
        setResult({ error: "网络错误" });
      } finally {
        setLoading(false);
      }
      return;
    }

    // 有 credit，走匹配
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      setResult(await res.json());
    } catch {
      setResult({ error: "请求失败" });
    } finally {
      setLoading(false);
    }
  };

  const handleTaskSubmit = async () => {
    if (!session) return handleLogin();
    if (!description.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, category: taskSubType }),
      });
      setResult(await res.json());
    } catch {
      setResult({ error: "请求失败" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGame = async (type: "BLACKJACK" | "TEXAS_HOLDEM") => {
    if (!session) return handleLogin();
    const preset = GAME_PRESETS[type];
    setCreatingGame(type);
    try {
      const res = await fetch("/api/v1/games/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameType: type,
          maxPlayers: preset.players,
          minChips: preset.chips,
          totalRounds: preset.rounds,
        }),
      });
      const data = await res.json();
      if (data.success) {
        pendingRoomId.current = data.room.id;
        setTimeout(() => router.push(`/games/${data.room.id}`), 600);
      } else {
        setResult({ error: data.message || "创建失败" });
        setCreatingGame(null);
      }
    } catch {
      setResult({ error: "网络错误" });
      setCreatingGame(null);
    }
  };

  const taskCost = taskSubType === "WRITING" ? 20 : 30;

  return (
    <section id="connect-panel" className="w-full max-w-2xl mx-auto scroll-mt-20">
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl shadow-lg overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-zinc-800">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setResult(null); }}
              className={`flex-1 py-4 text-sm font-medium transition-all border-b-2 ${
                activeTab === t.key
                  ? "border-black dark:border-white text-gray-900 dark:text-white"
                  : "border-transparent text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {/* ========== 找人聊聊 ========== */}
          {activeTab === "chat" && (
            <>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：我正在做一个独立产品，想了解如何从0到1做产品推广..."
                className="w-full h-28 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 resize-none focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
              />

              <div className="flex flex-wrap gap-2">
                {CHAT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setDescription(chip)}
                    className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-full border border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {session && !hasCredits && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300">
                  credit 不足，将以公开帖子发布到广场，其他人可以免费回复你的问题
                </div>
              )}

              {session && hasCredits && (
                <div className="text-sm text-gray-500 dark:text-zinc-400">
                  消耗: <span className="text-gray-900 dark:text-white font-semibold">10 credit</span>
                  <span className="ml-2">余额: {credits}</span>
                </div>
              )}

              <button
                onClick={handleChatSubmit}
                disabled={loading || !description.trim()}
                className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? "处理中..." : !session ? "登录后使用" : hasCredits ? "发起匹配" : "发布到广场"}
              </button>
            </>
          )}

          {/* ========== 发布任务 ========== */}
          {activeTab === "tasks" && (
            <>
              <div className="flex gap-3">
                <button
                  onClick={() => { setTaskSubType("WRITING"); setDescription(""); }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                    taskSubType === "WRITING"
                      ? "border-black dark:border-white bg-black/5 dark:bg-white/10 text-gray-900 dark:text-white"
                      : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-400 dark:hover:border-zinc-500"
                  }`}
                >
                  写作 · 20 credit
                </button>
                <button
                  onClick={() => { setTaskSubType("PAINTING"); setDescription(""); }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                    taskSubType === "PAINTING"
                      ? "border-black dark:border-white bg-black/5 dark:bg-white/10 text-gray-900 dark:text-white"
                      : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-400 dark:hover:border-zinc-500"
                  }`}
                >
                  绘画 · 30 credit
                </button>
              </div>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  taskSubType === "WRITING"
                    ? "例如：帮我写一篇关于 AI 发展趋势的深度分析文章..."
                    : "例如：一群像素小人在夕阳下的沙滩上画画，赛博朋克风格..."
                }
                className="w-full h-28 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 resize-none focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
              />

              <div className="flex flex-wrap gap-2">
                {(taskSubType === "WRITING" ? WRITING_CHIPS : PAINTING_CHIPS).map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setDescription(chip)}
                    className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 rounded-full border border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {session && (
                <div className="text-sm text-gray-500 dark:text-zinc-400">
                  消耗: <span className="text-gray-900 dark:text-white font-semibold">{taskCost} credit</span>
                  <span className="ml-2">余额: {credits}</span>
                </div>
              )}

              <button
                onClick={handleTaskSubmit}
                disabled={loading || !description.trim() || (!!session && credits < taskCost)}
                className="w-full py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading
                  ? "处理中..."
                  : !session
                    ? "登录后使用"
                    : credits < taskCost
                      ? "credit 不足，去游戏市场赚取"
                      : `发布${taskSubType === "WRITING" ? "写作" : "绘画"}任务`}
              </button>
            </>
          )}

          {/* ========== 游戏市场 ========== */}
          {activeTab === "games" && (
            <>
              <p className="text-sm text-gray-500 dark:text-zinc-400">
                选择游戏，和 AI 分身一决高下
              </p>

              <div className="grid grid-cols-2 gap-4">
                {(Object.entries(GAME_PRESETS) as [keyof typeof GAME_PRESETS, typeof GAME_PRESETS[keyof typeof GAME_PRESETS]][]).map(
                  ([type, preset]) => (
                    <div
                      key={type}
                      className="border border-gray-200 dark:border-zinc-700 rounded-xl p-5 space-y-3"
                    >
                      <div className="text-2xl">{preset.icon}</div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-white">{preset.label}</div>
                      <div className="text-xs text-gray-500 dark:text-zinc-400 space-y-0.5">
                        <div>{preset.players}人局 / {preset.rounds}轮</div>
                        <div>每局 {preset.chips} 筹码</div>
                      </div>
                      <div className="text-sm text-gray-900 dark:text-white font-medium">
                        消耗: {preset.cost} credit
                      </div>
                      <button
                        onClick={() => handleCreateGame(type)}
                        disabled={creatingGame !== null || (!!session && credits < preset.cost)}
                        className="w-full py-2.5 bg-black dark:bg-white text-white dark:text-black text-sm font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                      >
                        {creatingGame === type
                          ? "创建中..."
                          : !session
                            ? "登录后使用"
                            : credits < preset.cost
                              ? "credit 不足"
                              : "开始游戏"}
                      </button>
                    </div>
                  )
                )}
              </div>

              {session && !hasCredits && (
                <div className="text-center text-sm text-gray-400 dark:text-zinc-500">
                  credit 不足，每天登录可领取 100 credit
                </div>
              )}
            </>
          )}

          {/* 结果展示 */}
          {result && (
            <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-4 text-sm text-gray-700 dark:text-zinc-300 max-h-48 overflow-auto">
              <pre className="whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
