"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";

interface GameEvent {
  timestamp: number;
  round: number;
  type: "action" | "deal" | "result" | "phase" | "system";
  message: string;
  data?: Record<string, unknown>;
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
  createdAt: string;
}

const EVENT_COLORS: Record<string, string> = {
  action: "text-blue-300",
  deal: "text-yellow-300",
  result: "text-green-300",
  phase: "text-purple-300",
  system: "text-gray-400",
};

const EVENT_ICONS: Record<string, string> = {
  action: "🎯",
  deal: "🃏",
  result: "💰",
  phase: "📋",
  system: "⚙️",
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
  const eventsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }

    // 先获取房间数据
    fetchRoom();

    // 连接 SSE
    connectSSE();

    return () => {
      eventSourceRef.current?.close();
    };
  }, [authStatus, roomId]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  async function fetchRoom() {
    try {
      const res = await fetch(`/api/v1/games/rooms/${roomId}`);
      const data = await res.json();
      setRoom(data.room);
      if (data.events) setEvents(data.events);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  function connectSSE() {
    const es = new EventSource(`/api/v1/games/rooms/${roomId}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        if (event.type === "done") {
          setConnected(false);
          es.close();
          fetchRoom(); // 刷新最终状态
          return;
        }
        setEvents((prev) => [...prev, event]);
        // 定期刷新房间数据
        if (event.type === "system") fetchRoom();
      } catch {
        // ignore
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
    };
  }

  if (loading || authStatus === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        加载中...
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        房间不存在
      </div>
    );
  }

  const gameLabel = room.gameType === "BLACKJACK" ? "21点" : "德州扑克";

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 顶部信息 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{room.gameType === "BLACKJACK" ? "🃏" : "♠️"}</span>
              <h1 className="text-2xl font-bold">{gameLabel} · 观战</h1>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                room.status === "PLAYING" ? "bg-green-500" : "bg-gray-500"
              }`}>
                {room.status === "PLAYING" ? "进行中" : "已结束"}
              </span>
              {connected && (
                <span className="flex items-center gap-1 text-xs text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  实时连接
                </span>
              )}
            </div>
            <p className="text-gray-400 text-sm mt-1">
              第 {room.currentRound}/{room.totalRounds} 局 · {room.minChips} credit/局 · 创建者: {room.creator.name}
            </p>
          </div>
          <button
            onClick={() => router.push("/games")}
            className="px-4 py-2 bg-gray-800 rounded-lg text-sm hover:bg-gray-700 transition"
          >
            返回广场
          </button>
        </div>

        <div className="grid grid-cols-3 gap-6">
          {/* 左侧: 玩家面板 */}
          <div className="col-span-1 space-y-3">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">玩家</h2>
            {room.players.map((p) => (
              <div
                key={p.id}
                className={`p-4 rounded-xl border transition ${
                  p.status === "ACTIVE"
                    ? "bg-gray-900 border-gray-700"
                    : "bg-gray-900/50 border-gray-800 opacity-60"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-sm font-bold">
                      {p.name[0]}
                    </div>
                    <div>
                      <div className="font-medium text-sm">
                        {p.name}
                        {p.isCreator && <span className="ml-1 text-yellow-400 text-xs">★</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {p.isAI ? "AI 分身" : "真人"}
                        {p.status === "BUSTED" && " · 已出局"}
                        {p.status === "FOLDED" && " · 已弃牌"}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{p.chips}</div>
                    <div className="text-xs text-gray-500">筹码</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 右侧: 事件日志 */}
          <div className="col-span-2">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              对局日志
            </h2>
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 h-[600px] overflow-y-auto">
              {events.length === 0 ? (
                <div className="text-center text-gray-500 py-20">
                  {room.status === "PLAYING" ? "等待游戏事件..." : "暂无事件记录"}
                </div>
              ) : (
                <div className="space-y-2">
                  {events.map((event, idx) => {
                    const prevEvent = idx > 0 ? events[idx - 1] : null;
                    const showRoundDivider = prevEvent && prevEvent.round !== event.round && event.round > 0;

                    return (
                      <div key={idx}>
                        {showRoundDivider && (
                          <div className="flex items-center gap-2 my-4">
                            <div className="flex-1 h-px bg-gray-700" />
                            <span className="text-xs text-gray-500 font-medium">
                              第 {event.round} 局
                            </span>
                            <div className="flex-1 h-px bg-gray-700" />
                          </div>
                        )}
                        <div className={`flex items-start gap-2 text-sm ${EVENT_COLORS[event.type]}`}>
                          <span className="flex-shrink-0 mt-0.5">
                            {EVENT_ICONS[event.type]}
                          </span>
                          <span className="flex-1">{event.message}</span>
                          <span className="text-xs text-gray-600 flex-shrink-0">
                            {new Date(event.timestamp).toLocaleTimeString("zh-CN")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={eventsEndRef} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
