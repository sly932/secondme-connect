"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { PlayingCard, CardGroup } from "@/components/PlayingCard";

interface Card {
  suit: string;
  rank: string;
}

interface GameEvent {
  timestamp: number;
  round: number;
  type: "action" | "deal" | "result" | "phase" | "system";
  message: string;
  data?: Record<string, unknown>;
}

interface SnapshotPlayer {
  id: string;
  name: string;
  initialHand?: Card[];
  finalHand?: Card[];
  hand?: Card[];
  outcome: string;
  payout: number;
  chipsAfter: number;
  handRank?: string;
}

interface RoundSnapshot {
  round: number;
  gameType: string;
  pot: number;
  dealer?: { hand: Card[] };
  communityCards?: Card[];
  players: SnapshotPlayer[];
  actions: { seq: number; type: string; message: string; data?: Record<string, unknown> }[];
}

interface RoundData {
  roundNumber: number;
  status: string;
  pot: number;
  communityCards: Card[] | null;
  dealerHand: Card[] | null;
  resultLog: Record<string, unknown>[] | null;
  roundSnapshot: RoundSnapshot | null;
  winnerId: string | null;
}

interface Player {
  id: string;
  name: string;
  avatar: string | null;
  position: number;
  isCreator: boolean;
  isAI: boolean;
  chips: number;
  status: string;
}

interface RoomData {
  id: string;
  gameType: "BLACKJACK" | "TEXAS_HOLDEM";
  maxPlayers: number;
  minChips: number;
  totalRounds: number;
  currentRound: number;
  status: "PLAYING" | "COMPLETED" | "CANCELLED";
  creator: { name: string };
  players: Player[];
  rounds: RoundData[];
  createdAt: string;
}

const SEAT_COLORS = [
  "from-amber-500 to-orange-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-pink-500 to-rose-600",
  "from-violet-500 to-purple-600",
  "from-cyan-500 to-sky-600",
  "from-red-500 to-rose-700",
  "from-lime-500 to-green-600",
];

const OUTCOME_LABELS: Record<string, { text: string; color: string }> = {
  win: { text: "赢", color: "text-green-400" },
  blackjack: { text: "Blackjack!", color: "text-yellow-400" },
  lose: { text: "输", color: "text-red-400" },
  push: { text: "平局", color: "text-gray-400" },
  split: { text: "平分", color: "text-blue-400" },
  fold: { text: "弃牌", color: "text-gray-500" },
};

const EVENT_STYLES: Record<string, { color: string; icon: string }> = {
  action: { color: "text-blue-300", icon: "🎯" },
  deal: { color: "text-yellow-300", icon: "🃏" },
  result: { color: "text-green-300", icon: "💰" },
  phase: { color: "text-purple-300", icon: "📋" },
  system: { color: "text-gray-400", icon: "⚙️" },
};

export default function SpectatorPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const params = useParams();
  const roomId = params.id as string;

  const [room, setRoom] = useState<RoomData | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(1);
  const [userLockedTab, setUserLockedTab] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // 实时状态（当前进行中的局）
  const [livePlayerHands, setLivePlayerHands] = useState<Record<string, Card[]>>({});
  const [liveDealerCards, setLiveDealerCards] = useState<Card[]>([]);
  const [liveCommunityCards, setLiveCommunityCards] = useState<Card[]>([]);
  const [liveAction, setLiveAction] = useState("");
  const [livePot, setLivePot] = useState(0);
  const [liveThinking, setLiveThinking] = useState<{ playerId: string; playerName: string; text: string } | null>(null);

  const fetchRoom = useCallback(async (replaceEvents = false) => {
    try {
      const res = await fetch(`/api/v1/games/rooms/${roomId}`);
      const data = await res.json();
      setRoom(data.room);
      // 只在初始加载时用服务端 events，后续由 SSE 追加
      if (replaceEvents && data.events) setEvents(data.events);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  const processEvent = useCallback((event: GameEvent) => {
    // 新一轮开始时重置实时状态
    if (event.type === "system" && event.message.includes("开始")) {
      setLivePlayerHands({});
      setLiveDealerCards([]);
      setLiveCommunityCards([]);
      setLiveAction("");
      setLivePot(0);
      setLiveThinking(null);
      // 自动切换到新一局（除非用户手动锁定了 Tab）
      if (!userLockedTab) setActiveTab(event.round);
    }

    if (event.type === "deal" && event.data) {
      if (event.data.hand && event.data.playerId) {
        setLivePlayerHands((prev) => ({
          ...prev,
          [event.data!.playerId as string]: event.data!.hand as Card[],
        }));
      }
      if (event.data.dealerUpCard) {
        setLiveDealerCards([event.data.dealerUpCard as Card]);
      }
      if (event.data.dealerHand) {
        setLiveDealerCards(event.data.dealerHand as Card[]);
      }
      if (event.data.communityCards) {
        setLiveCommunityCards(event.data.communityCards as Card[]);
      }
    }

    if (event.type === "action") {
      setLiveAction(event.message);
      if (event.data?.pot) setLivePot(event.data.pot as number);
      // 显示 AI 思考
      if (event.data?.thinking) {
        setLiveThinking({
          playerId: event.data.playerId as string,
          playerName: (event.data.playerName as string) || "",
          text: event.data.thinking as string,
        });
        // 5 秒后自动消失
        setTimeout(() => setLiveThinking(null), 5000);
      } else {
        setLiveThinking(null);
      }
      // 实时更新手牌
      if (event.data?.hand && event.data?.playerId) {
        setLivePlayerHands((prev) => ({
          ...prev,
          [event.data!.playerId as string]: event.data!.hand as Card[],
        }));
      }
      if (event.data?.dealerHand) {
        setLiveDealerCards(event.data.dealerHand as Card[]);
      }
    }

    if (event.type === "phase" && event.data?.communityCards) {
      setLiveCommunityCards(event.data.communityCards as Card[]);
    }
  }, [userLockedTab]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }
    fetchRoom(true);

    const es = new EventSource(`/api/v1/games/rooms/${roomId}/stream`);
    eventSourceRef.current = es;
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "done") {
          setConnected(false);
          es.close();
          fetchRoom(true);
          return;
        }
        setEvents((prev) => [...prev, event]);
        processEvent(event);
        if (event.type === "system") fetchRoom();
      } catch {
        // ignore
      }
    };
    es.onerror = () => {
      setConnected(false);
      es.close();
    };
    return () => es.close();
  }, [authStatus, roomId, fetchRoom, processEvent, router]);

  // 初始化 activeTab
  useEffect(() => {
    if (room && !userLockedTab) {
      setActiveTab(Math.max(room.currentRound, 1));
    }
  }, [room, userLockedTab]);

  if (loading || authStatus === "loading") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-gray-300 dark:border-white/30 border-t-gray-900 dark:border-t-white rounded-full animate-spin" />
          加载中...
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white flex items-center justify-center">
        房间不存在
      </div>
    );
  }

  const gameLabel = room.gameType === "BLACKJACK" ? "21点" : "德州扑克";
  const isBlackjack = room.gameType === "BLACKJACK";
  const completedRound = room.rounds.find((r) => r.roundNumber === activeTab);
  const roundEvents = events.filter((e) => e.round === activeTab);
  const isLiveRound = room.status === "PLAYING" && (!completedRound || completedRound.status !== "COMPLETED") && roundEvents.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 pt-20 pb-4">
        {/* 顶部 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">{gameLabel}</h1>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              room.status === "PLAYING"
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : "bg-gray-500/20 text-gray-400 border border-gray-500/30"
            }`}>
              {room.status === "PLAYING" ? "进行中" : room.status === "COMPLETED" ? "已结束" : "已取消"}
            </span>
            {connected && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                实时
              </span>
            )}
          </div>
          <button
            onClick={() => router.push("/games")}
            className="px-3 py-1.5 bg-gray-200 dark:bg-gray-800 rounded-lg text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 transition"
          >
            返回
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
          {Array.from({ length: room.totalRounds }, (_, i) => i + 1).map((roundNum) => {
            const rd = room.rounds.find((r) => r.roundNumber === roundNum);
            const isCompleted = rd?.status === "COMPLETED";
            const isCurrent = roundNum === room.currentRound && room.status === "PLAYING";
            const isActive = roundNum === activeTab;

            return (
              <button
                key={roundNum}
                onClick={() => {
                  setActiveTab(roundNum);
                  setUserLockedTab(true);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-white text-black shadow"
                    : isCompleted
                    ? "bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700"
                    : isCurrent
                    ? "bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400 border border-green-300 dark:border-green-500/30 hover:bg-green-200 dark:hover:bg-green-900/70"
                    : "bg-gray-100 dark:bg-gray-900 text-gray-400 dark:text-gray-600"
                }`}
              >
                第 {roundNum} 局
                {isCompleted && !isActive && " ✓"}
                {isCurrent && !isCompleted && " ●"}
              </button>
            );
          })}
          {userLockedTab && (
            <button
              onClick={() => {
                setUserLockedTab(false);
                setActiveTab(Math.max(room.currentRound, 1));
              }}
              className="px-3 py-2 rounded-lg text-xs text-blue-400 hover:bg-blue-900/30 transition whitespace-nowrap"
            >
              跟随最新
            </button>
          )}
        </div>

        {/* 牌桌 */}
        <div className="relative bg-gradient-to-b from-green-900/80 via-green-800/90 to-green-900/80 rounded-3xl border-[6px] border-amber-900/80 shadow-[inset_0_4px_30px_rgba(0,0,0,0.4),0_8px_40px_rgba(0,0,0,0.5)] overflow-hidden min-h-[480px]">
          <div className="absolute inset-0 opacity-[0.03] [background-image:radial-gradient(circle,#fff_1px,transparent_1px)] [background-size:16px_16px]" />

          <div className="relative flex flex-col items-center justify-center py-8 min-h-[480px]">
            {isLiveRound ? (
              <LiveTable
                isBlackjack={isBlackjack}
                players={room.players}
                dealerCards={liveDealerCards}
                communityCards={liveCommunityCards}
                playerHands={livePlayerHands}
                currentAction={liveAction}
                pot={livePot}
                status={room.status}
                thinking={liveThinking}
              />
            ) : completedRound?.roundSnapshot ? (
              <CompletedTable
                snapshot={completedRound.roundSnapshot as unknown as RoundSnapshot}
                isBlackjack={isBlackjack}
              />
            ) : (
              <div className="text-white/40 text-sm">本局尚未开始</div>
            )}
          </div>
        </div>

        {/* 对局流程（文字） */}
        {(roundEvents.length > 0 || (completedRound?.roundSnapshot as unknown as RoundSnapshot)?.actions?.length > 0) && (
          <div className="mt-4 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">第 {activeTab} 局 · 对局流程</span>
            </div>
            <div className="p-4 max-h-[280px] overflow-y-auto">
              <EventLog
                events={isLiveRound ? roundEvents : []}
                snapshot={!isLiveRound ? (completedRound?.roundSnapshot as unknown as RoundSnapshot) : null}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 实时牌桌
// ============================================================
function LiveTable({
  isBlackjack,
  players,
  dealerCards,
  communityCards,
  playerHands,
  currentAction,
  pot,
  status,
  thinking,
}: {
  isBlackjack: boolean;
  players: Player[];
  dealerCards: Card[];
  communityCards: Card[];
  playerHands: Record<string, Card[]>;
  currentAction: string;
  pot: number;
  status: string;
  thinking: { playerId: string; playerName: string; text: string } | null;
}) {
  return (
    <>
      {/* 庄家/公共牌 */}
      {isBlackjack ? (
        <div className="mb-8">
          <div className="text-center mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">庄家</span>
          </div>
          <div className="flex gap-2 justify-center">
            {dealerCards.length > 0 ? (
              <CardGroup cards={dealerCards} size="lg" />
            ) : (
              <div className="flex gap-2">
                <PlayingCard suit="" rank="" faceDown size="lg" />
                <PlayingCard suit="" rank="" faceDown size="lg" />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <div className="text-center mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">公共牌</span>
          </div>
          <div className="flex gap-2 justify-center">
            {communityCards.length > 0 ? (
              <CardGroup cards={communityCards} size="lg" />
            ) : (
              <div className="flex gap-2">
                {[...Array(5)].map((_, i) => (
                  <PlayingCard key={i} suit="" rank="" faceDown size="lg" />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {pot > 0 && (
        <div className="mb-4 px-5 py-2 bg-black/30 rounded-full border border-white/10">
          <span className="text-yellow-400 font-bold text-sm">底池 {pot}</span>
        </div>
      )}

      {currentAction && (
        <div className="mb-6 px-4 py-2 bg-black/40 backdrop-blur rounded-xl border border-white/10 max-w-md text-center">
          <p className="text-sm text-white/80">{currentAction}</p>
        </div>
      )}

      {thinking && <ThinkingBubble playerName={thinking.playerName} text={thinking.text} />}

      <PlayerSeats players={players} playerHands={playerHands} status={status} />
    </>
  );
}

// ============================================================
// 已结束牌桌（从 snapshot 渲染）
// ============================================================
function CompletedTable({
  snapshot,
  isBlackjack,
}: {
  snapshot: RoundSnapshot;
  isBlackjack: boolean;
}) {
  return (
    <>
      {/* 庄家/公共牌 */}
      {isBlackjack && snapshot.dealer ? (
        <div className="mb-6">
          <div className="text-center mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">庄家</span>
          </div>
          <CardGroup cards={snapshot.dealer.hand} size="lg" />
        </div>
      ) : !isBlackjack && snapshot.communityCards ? (
        <div className="mb-6">
          <div className="text-center mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-white/50">公共牌</span>
          </div>
          <CardGroup cards={snapshot.communityCards} size="lg" />
        </div>
      ) : null}

      {snapshot.pot > 0 && (
        <div className="mb-6 px-5 py-2 bg-black/30 rounded-full border border-white/10">
          <span className="text-yellow-400 font-bold text-sm">底池 {snapshot.pot}</span>
        </div>
      )}

      {/* 结果卡片 */}
      <div className={`grid gap-3 mb-4 ${
        snapshot.players.length <= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3 md:grid-cols-6"
      }`}>
        {snapshot.players.map((p, idx) => {
          const outcomeInfo = OUTCOME_LABELS[p.outcome] || { text: p.outcome, color: "text-gray-400" };
          const cards = p.finalHand || p.hand || [];

          return (
            <div key={p.id} className="flex flex-col items-center gap-2">
              {/* 手牌 */}
              {cards.length > 0 && <CardGroup cards={cards} size="sm" />}

              {/* 结果 */}
              <div className="flex flex-col items-center p-3 rounded-2xl bg-black/40 border border-white/15 backdrop-blur">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${SEAT_COLORS[idx % SEAT_COLORS.length]} flex items-center justify-center text-sm font-bold shadow-lg mb-1.5`}>
                  {p.name[0]}
                </div>
                <span className="text-xs font-medium truncate max-w-[80px]">{p.name}</span>
                <span className={`text-xs font-bold mt-1 ${outcomeInfo.color}`}>
                  {outcomeInfo.text}
                </span>
                <span className={`text-xs font-semibold mt-0.5 ${
                  p.payout > 0 ? "text-green-400" : p.payout < 0 ? "text-red-400" : "text-gray-400"
                }`}>
                  {p.payout > 0 ? "+" : ""}{p.payout}
                </span>
                {p.handRank && (
                  <span className="text-[10px] text-white/40 mt-0.5">{p.handRank}</span>
                )}
                <div className="mt-1 px-2 py-0.5 bg-yellow-500/20 rounded-full">
                  <span className="text-[10px] font-semibold text-yellow-400">{p.chipsAfter}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ============================================================
// 玩家座位（实时用）
// ============================================================
function PlayerSeats({
  players,
  playerHands,
  status,
}: {
  players: Player[];
  playerHands: Record<string, Card[]>;
  status: string;
}) {
  return (
    <div className="w-full max-w-4xl px-8">
      <div className={`grid gap-4 ${
        players.length <= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3 md:grid-cols-6"
      }`}>
        {players.map((p, idx) => {
          const hand = playerHands[p.id];
          const isActive = p.status === "ACTIVE";

          return (
            <div key={p.id} className="flex flex-col items-center gap-2">
              <div className="min-h-[56px] flex items-end justify-center">
                {hand && hand.length > 0 ? (
                  <CardGroup cards={hand} size="sm" />
                ) : isActive && status === "PLAYING" ? (
                  <div className="flex gap-1">
                    <PlayingCard suit="" rank="" faceDown size="sm" />
                    <PlayingCard suit="" rank="" faceDown size="sm" />
                  </div>
                ) : null}
              </div>

              <div className={`flex flex-col items-center p-3 rounded-2xl border transition-all ${
                isActive
                  ? "bg-black/40 border-white/15 backdrop-blur"
                  : "bg-black/20 border-white/5 opacity-50"
              }`}>
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${SEAT_COLORS[idx % SEAT_COLORS.length]} flex items-center justify-center text-sm font-bold shadow-lg mb-1.5`}>
                  {p.name[0]}
                </div>
                <span className="text-xs font-medium truncate max-w-[80px]">
                  {p.name}
                  {p.isCreator && <span className="text-yellow-400 ml-0.5">★</span>}
                </span>
                <span className="text-[10px] text-gray-400">
                  {p.isAI ? "AI" : "玩家"}
                  {p.status === "BUSTED" && " · 出局"}
                  {p.status === "FOLDED" && " · 弃牌"}
                </span>
                <div className="mt-1.5 px-2 py-0.5 bg-yellow-500/20 rounded-full">
                  <span className="text-[10px] font-semibold text-yellow-400">{p.chips}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// AI 思考气泡
// ============================================================
function ThinkingBubble({ playerName, text }: { playerName: string; text: string }) {
  return (
    <div className="mb-6 max-w-lg w-full animate-[fadeInUp_0.3s_ease-out]">
      <div className="relative bg-gradient-to-br from-indigo-500/20 to-purple-500/20 backdrop-blur-md rounded-2xl border border-indigo-400/30 px-5 py-3.5 shadow-lg shadow-indigo-500/10">
        {/* 闪烁光点 */}
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-400 rounded-full animate-ping opacity-75" />
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-400 rounded-full" />

        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center">
            <span className="text-xs">💭</span>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-indigo-300">{playerName}</span>
            <p className="text-sm text-white/90 mt-0.5 leading-relaxed italic">&ldquo;{text}&rdquo;</p>
          </div>
        </div>

        {/* 气泡尾巴 */}
        <div className="absolute -bottom-2 left-8 w-4 h-4 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-b border-r border-indigo-400/30 rotate-45" />
      </div>
    </div>
  );
}

// ============================================================
// 事件日志
// ============================================================
function EventLog({
  events,
  snapshot,
}: {
  events: GameEvent[];
  snapshot: RoundSnapshot | null;
}) {
  // 已结束的局用 snapshot 里的 actions
  const items = snapshot
    ? snapshot.actions.map((a) => ({ type: a.type, message: a.message, thinking: (a.data?.thinking as string) || "", playerName: (a.data?.playerName as string) || "" }))
    : events.map((e) => ({ type: e.type, message: e.message, thinking: (e.data?.thinking as string) || "", playerName: (e.data?.playerName as string) || "" }));

  if (items.length === 0) {
    return <div className="text-center text-gray-500 py-6 text-sm">暂无事件</div>;
  }

  return (
    <div className="space-y-1.5">
      {items.map((item, idx) => {
        const style = EVENT_STYLES[item.type] || EVENT_STYLES.system;
        return (
          <div key={idx} className="space-y-0.5">
            <div className={`flex items-start gap-2 text-xs ${style.color}`}>
              <span className="flex-shrink-0">{style.icon}</span>
              <span className="flex-1">{item.message}</span>
            </div>
            {item.thinking && (
              <div className="flex items-start gap-2 text-xs ml-5 text-indigo-300/70 italic">
                <span className="flex-shrink-0">💭</span>
                <span className="flex-1">{item.playerName ? `${item.playerName}: ` : ""}&ldquo;{item.thinking}&rdquo;</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
