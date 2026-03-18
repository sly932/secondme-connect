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
  status?: string;
  totalBet?: number;
}

interface RoundSnapshot {
  round: number;
  gameType: string;
  pot: number;
  dealer?: { hand: Card[] };
  communityCards?: Card[];
  dealerIndex?: number;
  smallBlind?: number;
  bigBlind?: number;
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
  bio: string | null;
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

const OUTCOME_STYLES: Record<string, { text: string; bg: string; text_color: string; border: string }> = {
  win: { text: "胜出", bg: "bg-green-500/20", text_color: "text-green-400", border: "border-green-500/40" },
  blackjack: { text: "Blackjack!", bg: "bg-yellow-500/20", text_color: "text-yellow-300", border: "border-yellow-500/40" },
  lose: { text: "落败", bg: "bg-red-500/10", text_color: "text-red-400", border: "border-red-500/20" },
  push: { text: "平局", bg: "bg-gray-500/10", text_color: "text-gray-400", border: "border-gray-500/20" },
  split: { text: "平分", bg: "bg-blue-500/15", text_color: "text-blue-400", border: "border-blue-500/30" },
  fold: { text: "弃牌", bg: "bg-gray-500/10", text_color: "text-gray-500", border: "border-gray-500/15" },
};

const EVENT_STYLES: Record<string, { color: string; bg: string; icon: string }> = {
  action: { color: "text-blue-200", bg: "bg-blue-500/10", icon: "🎯" },
  deal: { color: "text-amber-200", bg: "bg-amber-500/10", icon: "🃏" },
  result: { color: "text-emerald-200", bg: "bg-emerald-500/10", icon: "💰" },
  phase: { color: "text-purple-200", bg: "bg-purple-500/10", icon: "📋" },
  system: { color: "text-gray-400", bg: "bg-gray-500/5", icon: "⚙️" },
};

// 牌型 → 显示等级颜色
function getHandRankStyle(handRank: string): { color: string; glow: string } {
  if (handRank.includes("皇家同花顺")) return { color: "text-yellow-300", glow: "shadow-yellow-500/30" };
  if (handRank.includes("同花顺")) return { color: "text-yellow-300", glow: "shadow-yellow-500/20" };
  if (handRank.includes("四条") || handRank.includes("铁支")) return { color: "text-orange-300", glow: "shadow-orange-500/20" };
  if (handRank.includes("葫芦")) return { color: "text-purple-300", glow: "shadow-purple-500/20" };
  if (handRank.includes("同花")) return { color: "text-blue-300", glow: "shadow-blue-500/20" };
  if (handRank.includes("顺子")) return { color: "text-cyan-300", glow: "shadow-cyan-500/20" };
  if (handRank.includes("三条")) return { color: "text-emerald-300", glow: "" };
  if (handRank.includes("两对")) return { color: "text-teal-300", glow: "" };
  if (handRank.includes("一对")) return { color: "text-sky-300", glow: "" };
  if (handRank.includes("Blackjack")) return { color: "text-yellow-300", glow: "shadow-yellow-500/30" };
  // 21点的 "XX点" 也高亮
  if (handRank.includes("点")) return { color: "text-white", glow: "" };
  return { color: "text-white/70", glow: "" };
}

export default function SpectatorPage() {
  const { status: authStatus } = useSession();
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

  // 实时状态
  const [livePlayerHands, setLivePlayerHands] = useState<Record<string, Card[]>>({});
  const [liveDealerCards, setLiveDealerCards] = useState<Card[]>([]);
  const [liveCommunityCards, setLiveCommunityCards] = useState<Card[]>([]);
  const [liveAction, setLiveAction] = useState("");
  const [livePot, setLivePot] = useState(0);
  const [liveThinking, setLiveThinking] = useState<{ playerId: string; playerName: string; text: string } | null>(null);
  const [liveBlinds, setLiveBlinds] = useState<{ dealerPlayerId?: string; sbPlayerId?: string; bbPlayerId?: string } | null>(null);

  const eventQueueRef = useRef<GameEvent[]>([]);
  const playingRef = useRef(false);

  const processEvent = useCallback((event: GameEvent) => {
    if (event.type === "system" && event.message.includes("开始")) {
      setLivePlayerHands({});
      setLiveDealerCards([]);
      setLiveCommunityCards([]);
      setLiveAction("");
      setLivePot(0);
      setLiveThinking(null);
      setLiveBlinds(null);
      if (!userLockedTab) setActiveTab(event.round);
    }

    // 捕获盲注信息
    if (event.type === "phase" && event.data?.dealerPlayerId) {
      setLiveBlinds({
        dealerPlayerId: event.data.dealerPlayerId as string,
        sbPlayerId: event.data.sbPlayerId as string,
        bbPlayerId: event.data.bbPlayerId as string,
      });
    }

    if (event.type === "deal" && event.data) {
      if (event.data.hand && event.data.playerId) {
        setLivePlayerHands((prev) => ({
          ...prev,
          [event.data!.playerId as string]: event.data!.hand as Card[],
        }));
      }
      if (event.data.dealerUpCard) setLiveDealerCards([event.data.dealerUpCard as Card]);
      if (event.data.dealerHand) setLiveDealerCards(event.data.dealerHand as Card[]);
      if (event.data.communityCards) setLiveCommunityCards(event.data.communityCards as Card[]);
    }

    if (event.type === "action") {
      setLiveAction(event.message);
      if (event.data?.pot) setLivePot(event.data.pot as number);
      if (event.data?.thinking) {
        setLiveThinking({
          playerId: event.data.playerId as string,
          playerName: (event.data.playerName as string) || "",
          text: event.data.thinking as string,
        });
      }
      if (event.data?.hand && event.data?.playerId) {
        setLivePlayerHands((prev) => ({
          ...prev,
          [event.data!.playerId as string]: event.data!.hand as Card[],
        }));
      }
      if (event.data?.dealerHand) setLiveDealerCards(event.data.dealerHand as Card[]);
    }

    if (event.type === "phase" && event.data?.communityCards) {
      setLiveCommunityCards(event.data.communityCards as Card[]);
    }

    if (event.type === "result") setLiveThinking(null);
  }, [userLockedTab]);

  const processEventRef = useRef(processEvent);
  processEventRef.current = processEvent;

  const fetchRoom = useCallback(async (replaceEvents = false) => {
    try {
      const res = await fetch(`/api/v1/games/rooms/${roomId}?eventsLimit=120`);
      const data = await res.json();
      setRoom(data.room);
      if (replaceEvents && data.events) {
        setEvents(data.events);
        // 回放初始事件到实时状态，让 LiveTable 能正确显示手牌/庄家/公共牌
        for (const event of data.events as GameEvent[]) {
          processEventRef.current(event);
        }
      }
      return data.events?.[data.events.length - 1]?.timestamp ?? 0;
    } catch {
      return 0;
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function connectSSE() {
      if (cancelled) return;
      const lastTimestamp = await fetchRoom(true);
      if (cancelled) return;

      const streamUrl = lastTimestamp > 0
        ? `/api/v1/games/rooms/${roomId}/stream?since=${lastTimestamp}`
        : `/api/v1/games/rooms/${roomId}/stream`;
      const es = new EventSource(streamUrl);
      eventSourceRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          if (event.type === "done") { setConnected(false); es.close(); void fetchRoom(false); return; }
          eventQueueRef.current.push(event);
          if (!playingRef.current) {
            playingRef.current = true;
            const playNext = () => {
              const next = eventQueueRef.current.shift();
              if (!next) { playingRef.current = false; return; }
              setEvents((prev) => [...prev, next]);
              processEvent(next);
              if (next.type === "system") void fetchRoom(false);
              const delay = next.type === "result" ? 600 : next.type === "action" ? 800 : next.type === "deal" ? 400 : 300;
              setTimeout(playNext, delay);
            };
            playNext();
          }
        } catch { /* ignore */ }
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // SSE 断连后 2 秒自动重连，重连时 fetchRoom(true) 会追回缺失事件
        if (!cancelled) {
          reconnectTimer = setTimeout(() => void connectSSE(), 2000);
        }
      };
    }

    if (authStatus === "unauthenticated") { router.push("/"); return; }
    if (authStatus === "authenticated") { void connectSSE(); }

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      eventSourceRef.current?.close();
      setConnected(false);
    };
  }, [authStatus, roomId, fetchRoom, processEvent, router]);

  // 计算真正的"最新局"：取 events 里最大 round 和 room.currentRound 的较大值
  const latestRound = Math.max(
    room?.currentRound ?? 1,
    events.length > 0 ? Math.max(...events.map((e) => e.round).filter((r) => r > 0)) : 1,
    1
  );

  // 自动跟随：始终跟到最新局（包括正在进行还没在 DB 更新的局）
  useEffect(() => {
    if (room && !userLockedTab) {
      setActiveTab(latestRound);
    }
  }, [room, userLockedTab, latestRound]);


  if (loading || authStatus === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          <span className="text-white/60">加载中...</span>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <span className="text-white/40">房间不存在</span>
      </div>
    );
  }

  const gameLabel = room.gameType === "BLACKJACK" ? "21点" : "德州扑克";
  const isBlackjack = room.gameType === "BLACKJACK";
  const completedRound = room.rounds.find((r) => r.roundNumber === activeTab);
  const roundEvents = events.filter((e) => e.round === activeTab);
  const isLiveRound = room.status === "PLAYING" && (!completedRound || completedRound.status !== "COMPLETED") && roundEvents.length > 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 pt-20 pb-8">
        {/* 顶栏 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{isBlackjack ? "🃏" : "♠️"}</span>
            <h1 className="text-xl font-bold">{gameLabel}</h1>
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
              room.status === "PLAYING"
                ? "bg-green-500/15 text-green-400 ring-1 ring-green-500/30"
                : "bg-white/5 text-white/50 ring-1 ring-white/10"
            }`}>
              {room.status === "PLAYING" ? "进行中" : room.status === "COMPLETED" ? "已结束" : "已取消"}
            </span>
            {connected && (
              <span className="flex items-center gap-1.5 text-xs text-green-400">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <button
            onClick={() => router.push("/games")}
            className="px-4 py-2 bg-white/5 rounded-lg text-sm text-white/60 hover:bg-white/10 hover:text-white transition ring-1 ring-white/10"
          >
            返回广场
          </button>
        </div>

        {/* 局数切换 + 跟随按钮 */}
        <div className="flex items-center gap-2 mb-5">
          <div className="flex gap-1 overflow-x-auto pb-1 flex-1">
            {Array.from({ length: room.totalRounds }, (_, i) => i + 1).map((roundNum) => {
              const rd = room.rounds.find((r) => r.roundNumber === roundNum);
              const isCompleted = rd?.status === "COMPLETED";
              const isCurrent = roundNum === latestRound && room.status === "PLAYING";
              const isActive = roundNum === activeTab;

              return (
                <button
                  key={roundNum}
                  onClick={() => { setActiveTab(roundNum); setUserLockedTab(true); }}
                  className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? "bg-white text-black shadow-lg shadow-white/10"
                      : isCompleted
                      ? "bg-white/10 text-white/70 hover:bg-white/15"
                      : isCurrent
                      ? "bg-green-500/15 text-green-400 ring-1 ring-green-500/30 hover:bg-green-500/25"
                      : "bg-white/5 text-white/30"
                  }`}
                >
                  {roundNum}
                  {isCompleted && !isActive && <span className="ml-1 text-green-400">✓</span>}
                  {isCurrent && !isCompleted && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  )}
                </button>
              );
            })}
          </div>
          {userLockedTab && (
            <button
              onClick={() => { setUserLockedTab(false); setActiveTab(latestRound); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-500/15 text-green-400 ring-1 ring-green-500/30 hover:bg-green-500/25 transition-all whitespace-nowrap animate-pulse"
            >
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              跟随直播
            </button>
          )}
        </div>

        {/* 牌桌 */}
        <div className="relative bg-gradient-to-b from-green-900/80 via-green-800/90 to-green-900/80 rounded-3xl border-[6px] border-amber-900/80 shadow-[inset_0_4px_30px_rgba(0,0,0,0.4),0_8px_40px_rgba(0,0,0,0.5)] overflow-hidden min-h-[520px]">
          <div className="absolute inset-0 opacity-[0.03] [background-image:radial-gradient(circle,#fff_1px,transparent_1px)] [background-size:16px_16px]" />

          <div className="relative flex flex-col items-center justify-center py-8 min-h-[520px]">
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
                blinds={liveBlinds}
              />
            ) : completedRound?.roundSnapshot ? (
              <CompletedTable
                snapshot={completedRound.roundSnapshot as unknown as RoundSnapshot}
                isBlackjack={isBlackjack}
                roomPlayers={room.players}
              />
            ) : (
              <WaitingForGame status={room.status} />
            )}
          </div>
        </div>

        {/* 对局流程 */}
        {(roundEvents.length > 0 || (completedRound?.roundSnapshot as unknown as RoundSnapshot)?.actions?.length > 0) && (
          <div className="mt-5 bg-gray-900/80 rounded-2xl border border-white/5 overflow-hidden backdrop-blur">
            <div className="px-5 py-3.5 border-b border-white/5 flex items-center gap-3">
              <span className="text-sm font-semibold text-white/80">第 {activeTab} 局</span>
              <span className="text-xs text-white/30">对局流程</span>
            </div>
            <div className="p-4 max-h-[320px] overflow-y-auto">
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
// 角色标签（庄家/小盲/大盲）
// ============================================================
function RoleBadge({ role }: { role: "D" | "SB" | "BB" }) {
  const styles = {
    D: "bg-yellow-500 text-black",
    SB: "bg-blue-500 text-white",
    BB: "bg-red-500 text-white",
  };
  return (
    <span className={`absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black ${styles[role]} ring-2 ring-green-900 shadow-lg z-10`}>
      {role}
    </span>
  );
}

// ============================================================
// 玩家简介浮层
// ============================================================
function PlayerTooltip({ name, bio, isAI, children }: {
  name: string;
  bio: string | null;
  isAI: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group/tip">
      {children}
      <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none opacity-0 translate-y-1 group-hover/tip:opacity-100 group-hover/tip:translate-y-0 transition-all duration-200">
        <div className="bg-gray-900/95 backdrop-blur-md border border-white/15 rounded-xl px-4 py-3 shadow-xl shadow-black/40 min-w-[180px] max-w-[260px]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-white truncate">{name}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              isAI ? "bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/30" : "bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/30"
            }`}>
              {isAI ? "AI 分身" : "玩家"}
            </span>
          </div>
          {bio ? (
            <p className="text-xs text-white/60 leading-relaxed line-clamp-3">{bio}</p>
          ) : (
            <p className="text-xs text-white/30 italic">暂无简介</p>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white/15" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 实时牌桌
// ============================================================
function LiveTable({
  isBlackjack, players, dealerCards, communityCards, playerHands,
  currentAction, pot, status, thinking, blinds,
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
  blinds: { dealerPlayerId?: string; sbPlayerId?: string; bbPlayerId?: string } | null;
}) {
  return (
    <>
      {/* 庄家/公共牌 */}
      {isBlackjack ? (
        <div className="mb-8">
          <div className="text-center mb-3">
            <span className="px-3 py-1 rounded-full bg-black/30 text-xs font-semibold uppercase tracking-widest text-white/50 border border-white/10">庄家</span>
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
            <span className="px-3 py-1 rounded-full bg-black/30 text-xs font-semibold uppercase tracking-widest text-white/50 border border-white/10">公共牌</span>
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

      {pot > 0 && <PotDisplay pot={pot} />}

      {currentAction && (
        <div className="mb-5 px-5 py-2.5 bg-black/50 backdrop-blur-sm rounded-xl border border-white/10 max-w-md text-center shadow-lg">
          <p className="text-sm text-white/90 font-medium">{currentAction}</p>
        </div>
      )}

      {thinking && <ThinkingBubble playerName={thinking.playerName} text={thinking.text} />}

      <PlayerSeats players={players} playerHands={playerHands} status={status} blinds={blinds} />
    </>
  );
}

// ============================================================
// 底池
// ============================================================
function PotDisplay({ pot }: { pot: number }) {
  return (
    <div className="mb-5 flex items-center gap-2 px-5 py-2 bg-black/40 rounded-full border border-yellow-500/20 shadow-lg shadow-yellow-500/5">
      <span className="text-yellow-400 text-sm">🪙</span>
      <span className="text-yellow-400 font-bold text-base tabular-nums">底池 {pot}</span>
    </div>
  );
}

// ============================================================
// 已结束牌桌
// ============================================================
function CompletedTable({
  snapshot,
  isBlackjack,
  roomPlayers,
}: {
  snapshot: RoundSnapshot;
  isBlackjack: boolean;
  roomPlayers: Player[];
}) {
  // 排序：赢家排前面
  const sortedPlayers = [...snapshot.players].sort((a, b) => {
    const order = { win: 0, blackjack: 0, split: 1, push: 2, lose: 3, fold: 4, unknown: 5 };
    return (order[a.outcome as keyof typeof order] ?? 5) - (order[b.outcome as keyof typeof order] ?? 5);
  });

  return (
    <>
      {/* 庄家/公共牌 */}
      {isBlackjack && snapshot.dealer ? (
        <div className="mb-6">
          <div className="text-center mb-3">
            <span className="px-3 py-1 rounded-full bg-black/30 text-xs font-semibold uppercase tracking-widest text-white/50 border border-white/10">庄家</span>
          </div>
          <CardGroup cards={snapshot.dealer.hand} size="lg" />
        </div>
      ) : !isBlackjack && snapshot.communityCards && snapshot.communityCards.length > 0 ? (
        <div className="mb-6">
          <div className="text-center mb-3">
            <span className="px-3 py-1 rounded-full bg-black/30 text-xs font-semibold uppercase tracking-widest text-white/50 border border-white/10">公共牌</span>
          </div>
          <CardGroup cards={snapshot.communityCards} size="lg" />
        </div>
      ) : !isBlackjack ? (
        <div className="mb-6 text-center">
          <span className="text-xs text-white/30">本局未翻出公共牌（提前结束）</span>
        </div>
      ) : null}

      {snapshot.pot > 0 && <PotDisplay pot={snapshot.pot} />}

      {/* 结果卡片 */}
      <div className="w-full max-w-5xl px-6">
        <div className={`grid gap-4 ${
          sortedPlayers.length <= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-" + Math.min(sortedPlayers.length, 6)
        }`}>
          {sortedPlayers.map((p, idx) => {
            const originalIdx = snapshot.players.findIndex((sp) => sp.id === p.id);
            const outcomeStyle = OUTCOME_STYLES[p.outcome] || { text: p.outcome, bg: "bg-white/5", text_color: "text-white/50", border: "border-white/10" };
            const cards = p.finalHand || p.hand || [];
            const isWinner = p.outcome === "win" || p.outcome === "blackjack" || p.outcome === "split";
            const handRankStyle = p.handRank ? getHandRankStyle(p.handRank) : null;

            // 德州角色标识
            let role: "D" | "SB" | "BB" | null = null;
            if (!isBlackjack && snapshot.dealerIndex !== undefined) {
              const sbIdx = (snapshot.dealerIndex + 1) % snapshot.players.length;
              const bbIdx = (snapshot.dealerIndex + 2) % snapshot.players.length;
              if (originalIdx === snapshot.dealerIndex) role = "D";
              else if (originalIdx === sbIdx) role = "SB";
              else if (originalIdx === bbIdx) role = "BB";
            }

            const rp = roomPlayers.find((rp) => rp.id === p.id);

            return (
              <div key={p.id} className={`flex flex-col items-center gap-3 p-4 rounded-2xl border backdrop-blur transition-all ${
                isWinner
                  ? "bg-gradient-to-b from-yellow-500/10 to-transparent border-yellow-500/25 shadow-lg shadow-yellow-500/5"
                  : "bg-black/30 border-white/10"
              }`}>
                {/* 手牌 */}
                {cards.length > 0 && (
                  <div className="flex gap-1.5 justify-center">
                    <CardGroup cards={cards} size="md" />
                  </div>
                )}

                {/* 牌型 — 醒目展示 */}
                {p.handRank && handRankStyle && (
                  <div className={`px-3 py-1 rounded-lg bg-black/40 border border-white/10 ${handRankStyle.glow ? `shadow-lg ${handRankStyle.glow}` : ""}`}>
                    <span className={`text-sm font-bold ${handRankStyle.color}`}>{p.handRank}</span>
                  </div>
                )}

                {/* 头像 + 名字 — hover 显示简介 */}
                <PlayerTooltip name={p.name} bio={rp?.bio ?? null} isAI={rp?.isAI ?? false}>
                  <div className="flex flex-col items-center gap-1.5 cursor-default">
                    <div className="relative">
                      <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${SEAT_COLORS[originalIdx % SEAT_COLORS.length]} flex items-center justify-center text-sm font-bold shadow-lg ${isWinner ? "ring-2 ring-yellow-400/50" : ""}`}>
                        {p.name[0]}
                      </div>
                      {role && <RoleBadge role={role} />}
                    </div>
                    <span className="text-sm font-medium truncate max-w-[100px]">{p.name}</span>
                  </div>
                </PlayerTooltip>

                {/* 结果 + 筹码变动 */}
                <div className="flex flex-col items-center gap-1.5 w-full">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${outcomeStyle.bg} ${outcomeStyle.text_color} ${outcomeStyle.border} border`}>
                    {outcomeStyle.text}
                  </span>
                  <span className={`text-lg font-bold tabular-nums ${
                    p.payout > 0 ? "text-green-400" : p.payout < 0 ? "text-red-400" : "text-white/40"
                  }`}>
                    {p.payout > 0 ? "+" : ""}{p.payout}
                  </span>
                  <div className="px-3 py-1 bg-yellow-500/15 rounded-full border border-yellow-500/20">
                    <span className="text-xs font-semibold text-yellow-400 tabular-nums">💰 {p.chipsAfter}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ============================================================
// 玩家座位
// ============================================================
function PlayerSeats({
  players, playerHands, status, blinds,
}: {
  players: Player[];
  playerHands: Record<string, Card[]>;
  status: string;
  blinds: { dealerPlayerId?: string; sbPlayerId?: string; bbPlayerId?: string } | null;
}) {
  return (
    <div className="w-full max-w-5xl px-6">
      <div className={`grid gap-4 ${
        players.length <= 4 ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-" + Math.min(players.length, 6)
      }`}>
        {players.map((p, idx) => {
          const hand = playerHands[p.id];
          const isActive = p.status === "ACTIVE";

          // 角色标识
          let role: "D" | "SB" | "BB" | null = null;
          if (blinds) {
            if (p.id === blinds.dealerPlayerId) role = "D";
            else if (p.id === blinds.sbPlayerId) role = "SB";
            else if (p.id === blinds.bbPlayerId) role = "BB";
          }

          return (
            <div key={p.id} className="flex flex-col items-center gap-2">
              {/* 手牌区 */}
              <div className="min-h-[72px] flex items-end justify-center">
                {hand && hand.length > 0 ? (
                  <CardGroup cards={hand} size="md" />
                ) : isActive && status === "PLAYING" ? (
                  <div className="flex gap-1">
                    <PlayingCard suit="" rank="" faceDown size="md" />
                    <PlayingCard suit="" rank="" faceDown size="md" />
                  </div>
                ) : null}
              </div>

              {/* 信息卡 — hover 显示简介 */}
              <PlayerTooltip name={p.name} bio={p.bio} isAI={p.isAI}>
                <div className={`flex flex-col items-center p-3.5 rounded-2xl border transition-all min-w-[100px] cursor-default ${
                  isActive
                    ? "bg-black/40 border-white/15 backdrop-blur"
                    : "bg-black/20 border-white/5 opacity-40"
                }`}>
                  <div className="relative">
                    <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${SEAT_COLORS[idx % SEAT_COLORS.length]} flex items-center justify-center text-sm font-bold shadow-lg mb-2`}>
                      {p.name[0]}
                    </div>
                    {role && <RoleBadge role={role} />}
                  </div>
                  <span className="text-xs font-semibold truncate max-w-[90px]">
                    {p.name}
                    {p.isCreator && <span className="text-yellow-400 ml-0.5">★</span>}
                  </span>
                  <span className="text-[10px] text-white/40 mt-0.5">
                    {p.isAI ? "AI 分身" : "玩家"}
                    {p.status === "BUSTED" && " · 出局"}
                    {p.status === "FOLDED" && " · 弃牌"}
                  </span>
                  <div className="mt-2 px-2.5 py-0.5 bg-yellow-500/15 rounded-full border border-yellow-500/20">
                    <span className="text-[11px] font-semibold text-yellow-400 tabular-nums">{p.chips}</span>
                  </div>
                </div>
              </PlayerTooltip>
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
      <div className="relative bg-gradient-to-br from-indigo-500/15 to-purple-500/15 backdrop-blur-md rounded-2xl border border-indigo-400/25 px-5 py-4 shadow-xl shadow-indigo-500/10">
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-400 rounded-full animate-ping opacity-75" />
        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-indigo-400 rounded-full" />

        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/25 border border-indigo-400/30 flex items-center justify-center">
            <span className="text-sm">💭</span>
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-bold text-indigo-300">{playerName}</span>
            <p className="text-sm text-white/85 mt-1 leading-relaxed italic">&ldquo;{text}&rdquo;</p>
          </div>
        </div>

        <div className="absolute -bottom-2 left-8 w-4 h-4 bg-gradient-to-br from-indigo-500/15 to-purple-500/15 border-b border-r border-indigo-400/25 rotate-45" />
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
  const items = snapshot
    ? snapshot.actions.map((a) => ({ type: a.type, message: a.message, thinking: (a.data?.thinking as string) || "", playerName: (a.data?.playerName as string) || "" }))
    : events.map((e) => ({ type: e.type, message: e.message, thinking: (e.data?.thinking as string) || "", playerName: (e.data?.playerName as string) || "" }));

  if (items.length === 0) {
    return <div className="text-center text-white/30 py-8 text-sm">暂无事件</div>;
  }

  return (
    <div className="space-y-1">
      {items.map((item, idx) => {
        const style = EVENT_STYLES[item.type] || EVENT_STYLES.system;
        return (
          <div key={idx} className="space-y-0.5">
            <div className={`flex items-start gap-2.5 text-sm py-1.5 px-3 rounded-lg transition-colors ${style.bg}`}>
              <span className="flex-shrink-0 text-xs mt-0.5">{style.icon}</span>
              <span className={`flex-1 ${style.color}`}>{item.message}</span>
            </div>
            {item.thinking && (
              <div className="flex items-start gap-2.5 text-xs ml-6 py-1 px-3 text-indigo-300/60 italic">
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

// ============================================================
// 等待游戏开始
// ============================================================
const WAITING_STEPS = [
  { label: "正在初始化牌桌", icon: "🎰" },
  { label: "正在连接 AI 分身", icon: "🤖" },
  { label: "正在准备发牌", icon: "🃏" },
  { label: "即将开始", icon: "✨" },
];

function WaitingForGame({ status }: { status: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (status !== "PLAYING") return;
    const interval = setInterval(() => {
      setStep((s) => (s < WAITING_STEPS.length - 1 ? s + 1 : s));
    }, 1500);
    return () => clearInterval(interval);
  }, [status]);

  if (status === "COMPLETED") {
    return <span className="text-white/30 text-sm">游戏已结束</span>;
  }
  if (status === "CANCELLED") {
    return <span className="text-red-400/60 text-sm">游戏已取消</span>;
  }

  const current = WAITING_STEPS[step];

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center text-2xl animate-pulse">
          {current.icon}
        </div>
        <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-emerald-400/20 animate-ping" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-white/80">{current.label}</p>
        <div className="flex items-center gap-1.5 justify-center">
          {WAITING_STEPS.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
              i <= step ? "bg-emerald-400" : "bg-white/15"
            } ${i === step ? "scale-125" : ""}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
