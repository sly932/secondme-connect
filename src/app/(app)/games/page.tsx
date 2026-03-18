"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { GameCreatingOverlay } from "@/components/GameCreatingOverlay";

interface Room {
  id: string;
  gameType: "BLACKJACK" | "TEXAS_HOLDEM";
  maxPlayers: number;
  minChips: number;
  totalRounds: number;
  currentRound: number;
  status: "PLAYING" | "COMPLETED" | "CANCELLED";
  creator: { name: string; avatar: string | null };
  players: { name: string; isAI: boolean; chips: number; status: string }[];
  spectateUrl: string;
  createdAt: string;
}

const GAME_LABELS: Record<string, string> = {
  BLACKJACK: "21点",
  TEXAS_HOLDEM: "德州扑克",
};

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  PLAYING: { text: "进行中", color: "bg-green-500" },
  COMPLETED: { text: "已结束", color: "bg-gray-500" },
  CANCELLED: { text: "已取消", color: "bg-red-500" },
};

export default function GamesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [apiDone, setApiDone] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // 创建房间表单
  const [gameType, setGameType] = useState<"BLACKJACK" | "TEXAS_HOLDEM">("BLACKJACK");
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [minChips, setMinChips] = useState(10);
  const [totalRounds, setTotalRounds] = useState(5);

  const [tab, setTab] = useState<"all" | "PLAYING" | "COMPLETED">("all");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    fetchRooms();
  }, [status, tab]);

  async function fetchRooms() {
    try {
      const res = await fetch(`/api/v1/games/rooms?status=${tab}`);
      const data = await res.json();
      setRooms(data.rooms || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function createRoom() {
    setCreating(true);
    setApiDone(false);
    setCreateError(null);

    try {
      const res = await fetch("/api/v1/games/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType, maxPlayers, minChips, totalRounds }),
      });
      const data = await res.json();

      if (data.success) {
        setApiDone(true);
        setTimeout(() => {
          router.push(`/games/${data.room.id}`);
        }, 800);
      } else {
        setCreateError(data.message || data.error || "创建失败");
        setTimeout(() => {
          setCreating(false);
          setCreateError(null);
        }, 2000);
      }
    } catch {
      setCreateError("网络错误，请重试");
      setTimeout(() => {
        setCreating(false);
        setCreateError(null);
      }, 2000);
    }
  }

  if (status === "loading") return null;

  const totalCost = minChips * totalRounds;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-20 pb-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">游戏广场</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">创建房间，与 AI 分身对战</p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-6 py-3 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition"
          >
            创建房间
          </button>
        </div>

        {/* 创建房间面板 */}
        {showCreate && (
          <div className="mb-8 p-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
            {creating ? (
              <GameCreatingOverlay
                gameLabel={GAME_LABELS[gameType]}
                playerCount={maxPlayers}
                apiDone={apiDone}
                error={createError}
              />
            ) : (
              <>
                <h2 className="text-xl font-semibold mb-4">创建新房间</h2>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  {/* 游戏类型 */}
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">游戏类型</label>
                    <div className="flex gap-2">
                      {(["BLACKJACK", "TEXAS_HOLDEM"] as const).map((type) => (
                        <button
                          key={type}
                          onClick={() => {
                            setGameType(type);
                            if (type === "TEXAS_HOLDEM" && maxPlayers < 3) setMaxPlayers(4);
                          }}
                          className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                            gameType === type
                              ? "bg-black dark:bg-white text-white dark:text-black"
                              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                          }`}
                        >
                          {GAME_LABELS[type]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 人数 */}
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">人数 (含你自己)</label>
                    <select
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white"
                    >
                      {(gameType === "BLACKJACK"
                        ? [2, 3, 4, 5]
                        : [3, 4, 5, 6, 7, 8]
                      ).map((n) => (
                        <option key={n} value={n}>{n} 人</option>
                      ))}
                    </select>
                  </div>

                  {/* 最小筹码 */}
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">最小筹码 (每局)</label>
                    <select
                      value={minChips}
                      onChange={(e) => setMinChips(Number(e.target.value))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white"
                    >
                      {[5, 10, 20, 50, 100].map((n) => (
                        <option key={n} value={n}>{n} credit</option>
                      ))}
                    </select>
                  </div>

                  {/* 局数 */}
                  <div>
                    <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">局数</label>
                    <select
                      value={totalRounds}
                      onChange={(e) => setTotalRounds(Number(e.target.value))}
                      className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white"
                    >
                      {[1, 3, 5, 10].map((n) => (
                        <option key={n} value={n}>{n} 局</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-800">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    预扣费用: <span className="text-gray-900 dark:text-white font-semibold">{totalCost} credit</span>
                    <span className="ml-2 text-gray-400 dark:text-gray-500">({minChips} × {totalRounds} 局)</span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCreate(false)}
                      className="px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition"
                    >
                      取消
                    </button>
                    <button
                      onClick={createRoom}
                      className="px-6 py-2 bg-black dark:bg-white text-white dark:text-black font-semibold rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition"
                    >
                      创建并开始
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Tab 切换 */}
        <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-900 rounded-lg p-1 w-fit">
          {([
            { key: "all", label: "全部" },
            { key: "PLAYING", label: "进行中" },
            { key: "COMPLETED", label: "已结束" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm transition ${
                tab === t.key ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 房间列表 */}
        {loading ? (
          <div className="text-center py-20 text-gray-400 dark:text-gray-500">加载中...</div>
        ) : rooms.length === 0 ? (
          <div className="text-center py-20 text-gray-400 dark:text-gray-500">
            暂无房间，点击「创建房间」开始游戏
          </div>
        ) : (
          <div className="grid gap-4">
            {rooms.map((room) => {
              const statusInfo = STATUS_LABELS[room.status];
              return (
                <div
                  key={room.id}
                  onClick={() => router.push(`/games/${room.id}`)}
                  className="p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-gray-400 dark:hover:border-gray-600 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">
                        {room.gameType === "BLACKJACK" ? "🃏" : "♠️"}
                      </span>
                      <span className="font-semibold text-lg">
                        {GAME_LABELS[room.gameType]}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs text-white ${statusInfo.color}`}>
                        {statusInfo.text}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {room.status === "PLAYING"
                        ? `第 ${room.currentRound}/${room.totalRounds} 局`
                        : `共 ${room.totalRounds} 局`}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>创建者: {room.creator.name}</span>
                    <span>·</span>
                    <span>{room.players.length} 人</span>
                    <span>·</span>
                    <span>{room.minChips} credit/局</span>
                    <span>·</span>
                    <span>{new Date(room.createdAt).toLocaleString("zh-CN")}</span>
                  </div>

                  {/* 玩家列表 */}
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {room.players.map((p, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-1 rounded text-xs ${
                          p.isAI ? "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400" : "bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300"
                        }`}
                      >
                        {p.name} {p.isAI ? "(AI)" : ""} · {p.chips}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
