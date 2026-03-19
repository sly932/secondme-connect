"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { usePanelStore, useUserStore, useFontStore, LOGO_FONT_CSS } from "@/lib/store";
import type { PanelTab } from "@/lib/store";
import { GameCreatingOverlay } from "@/components/GameCreatingOverlay";
import { TaskCreatingOverlay } from "@/components/TaskCreatingOverlay";

const GAME_PRESETS = {
  BLACKJACK: { label: "21 点", icon: "🃏", players: 4, chips: 10, rounds: 5, cost: 50 },
  TEXAS_HOLDEM: { label: "德州扑克", icon: "♠️", players: 6, chips: 10, rounds: 5, cost: 50 },
} as const;

const CHAT_CHIPS = [
  "最近总做重复的梦，梦境和潜意识之间有什么关系？",
  "在大城市独居三年，深夜的孤独感该怎么排解？",
  "产品功能越做越多用户反而流失，怎么做减法？",
  "小众品牌预算有限，怎么用内容打出品牌差异化？",
  "工作五年感觉停滞了，如何建立多元思维模型？",
];

const WRITING_CHIPS = [
  "帮我写一篇吐槽互联网黑话的犀利小作文",
  "用最少的字把我的创业故事讲得打动人",
  "写一篇关于北漂独居生活的走心随笔",
  "帮我写一封得体又带点幽默的婚礼致辞",
  "把我的产品介绍改写得有画面感和故事性",
];

const PAINTING_CHIPS = [
  "给我画一张色彩很浓烈的星空城市夜景",
  "画一张铺满波点的时尚潮流海报",
  "画一幅阳光洒在湖面上朦朦胧胧的风景",
  "画一个梦里才会出现的奇幻办公室场景",
  "画一幅黑白的大气山川风光",
];

const TABS: { key: PanelTab; label: string; icon: React.ReactNode }[] = [
  {
    key: "chat",
    label: "找人聊聊",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    key: "tasks",
    label: "发布任务",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    key: "games",
    label: "游戏市场",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8M12 8v8" />
      </svg>
    ),
  },
];

export function ConnectPanel() {
  const { data: session } = useSession();
  const router = useRouter();
  const { activeTab, taskSubType, setTab, setTaskSubType } = usePanelStore();
  const credits = useUserStore((s) => s.credits);
  const logoFont = useFontStore((s) => s.logoFont);

  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [creatingGame, setCreatingGame] = useState<string | null>(null);
  const [gameApiDone, setGameApiDone] = useState(false);
  const [gameCreateError, setGameCreateError] = useState<string | null>(null);
  const pendingRoomId = useRef<string | null>(null);

  const [submittingType, setSubmittingType] = useState<"chat" | "writing" | "painting" | null>(null);
  const [submitApiDone, setSubmitApiDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSummary, setSubmitSummary] = useState<string | null>(null);

  const hasCredits = credits > 0;

  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };

  const handleChatSubmit = async () => {
    if (!session) return handleLogin();
    if (!description.trim()) return;

    setSubmittingType("chat");
    setSubmitApiDone(false);
    setSubmitError(null);
    setSubmitSummary(null);
    setResult(null);

    try {
      const res = await fetch("/api/v1/plaza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: description }),
      });
      const data = await res.json();

      if (data.success) {
        const msg = data.tasks?.length
          ? `已向 ${data.tasks.length} 个分身发起咨询`
          : data.matchCount > 0
            ? `找到 ${data.matchCount} 个匹配的分身`
            : "已发布到广场";
        setSubmitSummary(msg);
        setSubmitApiDone(true);
        setDescription("");
        setTimeout(() => {
          router.push("/plaza");
          setSubmittingType(null);
        }, 1200);
      } else {
        setSubmitError(data.message || "发布失败");
        setTimeout(() => setSubmittingType(null), 2500);
      }
    } catch {
      setSubmitError("网络错误，请重试");
      setTimeout(() => setSubmittingType(null), 2500);
    }
  };

  const handleTaskSubmit = async () => {
    if (!session) return handleLogin();
    if (!description.trim()) return;

    const type = taskSubType === "WRITING" ? "writing" as const : "painting" as const;
    setSubmittingType(type);
    setSubmitApiDone(false);
    setSubmitError(null);
    setSubmitSummary(null);
    setResult(null);

    try {
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, category: taskSubType }),
      });
      const data = await res.json();

      if (data.tasks?.length) {
        setSubmitSummary(`已分配给 ${data.tasks.length} 个分身`);
        setSubmitApiDone(true);
        setDescription("");
        setTimeout(() => {
          router.push("/plaza");
          setSubmittingType(null);
        }, 1200);
      } else if (data.error || data.message?.includes("不足")) {
        setSubmitError(data.error || data.message || "创建失败");
        setTimeout(() => setSubmittingType(null), 2500);
      } else {
        setSubmitSummary("任务已创建");
        setSubmitApiDone(true);
        setDescription("");
        setTimeout(() => {
          setSubmittingType(null);
          setResult(data);
        }, 1500);
      }
    } catch {
      setSubmitError("网络错误，请重试");
      setTimeout(() => setSubmittingType(null), 2500);
    }
  };

  const handleCreateGame = async (type: "BLACKJACK" | "TEXAS_HOLDEM") => {
    if (!session) return handleLogin();
    const preset = GAME_PRESETS[type];
    setCreatingGame(type);
    setGameApiDone(false);
    setGameCreateError(null);
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
        setGameApiDone(true);
        setTimeout(() => router.push(`/games/${data.room.id}`), 800);
      } else {
        setGameCreateError(data.message || "创建失败");
        setTimeout(() => {
          setCreatingGame(null);
          setGameCreateError(null);
        }, 2000);
      }
    } catch {
      setGameCreateError("网络错误，请重试");
      setTimeout(() => {
        setCreatingGame(null);
        setGameCreateError(null);
      }, 2000);
    }
  };

  const taskCost = 1;

  return (
    <section id="connect-panel" className="w-full max-w-2xl mx-auto scroll-mt-20">
      <div className="bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800/80 rounded-2xl shadow-lg dark:shadow-zinc-900/50 overflow-hidden backdrop-blur-sm">
        {/* Tabs */}
        <div className="flex border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/50">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setResult(null); }}
              className={`flex-1 py-4 text-sm font-medium transition-all duration-200 border-b-2 flex items-center justify-center gap-2 ${
                activeTab === t.key
                  ? "border-gray-900 dark:border-white text-gray-900 dark:text-white bg-white dark:bg-zinc-900/80"
                  : "border-transparent text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-800/30"
              }`}
            >
              <span className={activeTab === t.key ? "opacity-100" : "opacity-50"}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {/* ========== 找人聊聊 ========== */}
          {activeTab === "chat" && (
            <>
              {submittingType === "chat" ? (
                <TaskCreatingOverlay
                  type="chat"
                  apiDone={submitApiDone}
                  error={submitError}
                  summary={submitSummary ?? undefined}
                />
              ) : (
              <>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例如：最近压力很大总失眠，有什么调节情绪的好方法吗..."
                className="w-full h-28 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 resize-none input-focus focus:outline-none transition-all"
              />

              <div className="flex flex-wrap gap-2">
                {CHAT_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setDescription(chip)}
                    className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-zinc-800/80 text-gray-600 dark:text-zinc-400 rounded-full border border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-700/80 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {session && !hasCredits && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300">
                  credit 不足，需求将发布到广场并匹配分身，但不会自动发起咨询。其他人仍可评论你的需求。
                </div>
              )}

              {session && hasCredits && (
                <div className="text-sm text-gray-500 dark:text-zinc-400">
                  发布到广场 + 自动匹配分身，咨询消耗: <span className="text-gray-900 dark:text-white font-semibold">1 credit/人</span>
                  <span className="ml-2">余额: {credits}</span>
                </div>
              )}

              <button
                onClick={handleChatSubmit}
                disabled={loading || !description.trim()}
                className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-black text-lg font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
                style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}
              >
                {!session ? "登录后使用" : "Connect"}
              </button>
              </>
              )}
            </>
          )}

          {/* ========== 发布任务 ========== */}
          {activeTab === "tasks" && (
            <>
              {submittingType === "writing" || submittingType === "painting" ? (
                <TaskCreatingOverlay
                  type={submittingType}
                  apiDone={submitApiDone}
                  error={submitError}
                  summary={submitSummary ?? undefined}
                />
              ) : (
              <>
              <div className="flex gap-3">
                <button
                  onClick={() => { setTaskSubType("WRITING"); setDescription(""); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 ${
                    taskSubType === "WRITING"
                      ? "border-gray-900 dark:border-white bg-gray-900/5 dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                      : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-400 dark:hover:border-zinc-500"
                  }`}
                >
                  写作 · 1 credit
                </button>
                <button
                  onClick={() => { setTaskSubType("PAINTING"); setDescription(""); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all duration-200 ${
                    taskSubType === "PAINTING"
                      ? "border-gray-900 dark:border-white bg-gray-900/5 dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                      : "border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:border-gray-400 dark:hover:border-zinc-500"
                  }`}
                >
                  绘画 · 1 credit
                </button>
              </div>

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  taskSubType === "WRITING"
                    ? "例如：帮我把年终总结写得有趣一点，别太官方..."
                    : "例如：画一张适合做手机壁纸的梦幻风景..."
                }
                className="w-full h-28 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 resize-none input-focus focus:outline-none transition-all"
              />

              <div className="flex flex-wrap gap-2">
                {(taskSubType === "WRITING" ? WRITING_CHIPS : PAINTING_CHIPS).map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setDescription(chip)}
                    className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-zinc-800/80 text-gray-600 dark:text-zinc-400 rounded-full border border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-700/80 hover:-translate-y-0.5 transition-all duration-200"
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
                className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-black text-lg font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
                style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}
              >
                {loading
                  ? "处理中..."
                  : !session
                    ? "登录后使用"
                    : credits < taskCost
                      ? "credit 不足，去游戏市场赚取"
                      : "Connect"}
              </button>
              </>
              )}
            </>
          )}

          {/* ========== 游戏市场 ========== */}
          {activeTab === "games" && (
            <>
              {creatingGame ? (
                <GameCreatingOverlay
                  gameLabel={GAME_PRESETS[creatingGame as keyof typeof GAME_PRESETS].label}
                  playerCount={GAME_PRESETS[creatingGame as keyof typeof GAME_PRESETS].players}
                  apiDone={gameApiDone}
                  error={gameCreateError}
                />
              ) : (
                <>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">
                    选择游戏，和 AI 分身一决高下
                  </p>

                  <div className="grid grid-cols-2 gap-4">
                    {(Object.entries(GAME_PRESETS) as [keyof typeof GAME_PRESETS, typeof GAME_PRESETS[keyof typeof GAME_PRESETS]][]).map(
                      ([type, preset]) => (
                        <div
                          key={type}
                          className="border border-gray-200 dark:border-zinc-700 rounded-xl p-5 space-y-3 card-hover bg-white dark:bg-zinc-800/50"
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
                            disabled={!!session && credits < preset.cost}
                            className="w-full py-2.5 bg-gray-900 dark:bg-white text-white dark:text-black text-base font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                            style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}
                          >
                            {!session
                              ? "登录后使用"
                              : credits < preset.cost
                                ? "credit 不足"
                                : "Connect"}
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
            </>
          )}

          {/* 结果展示 */}
          {result && (
            <div className="space-y-3 animate-fade-in-up">
              {result.error ? (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
                  {String(result.error)}
                </div>
              ) : (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4 text-sm text-green-700 dark:text-green-300 space-y-2">
                  <p className="font-medium">{String(result.message || "已发布")}</p>
                  <button
                    onClick={() => { router.push("/plaza"); setResult(null); }}
                    className="text-xs text-green-600 dark:text-green-400 hover:underline"
                  >
                    去广场查看详情 &rarr;
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
