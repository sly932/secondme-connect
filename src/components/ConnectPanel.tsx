"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUserStore, useFontStore, LOGO_FONT_CSS } from "@/lib/store";
import { useT } from "@/lib/i18n";

type Intent = "consult" | "writing" | "painting" | "game" | "portrait";
type Phase = "input" | "recognizing" | "matching" | "done";

interface MatchedWorker {
  id: string;
  name: string;
  avatar: string | null;
  portraitUrl?: string | null;
}

interface ConnectPanelProps {
  onAllReady?: (postId: string | null) => void;
}

function SmallAvatar({ name, avatar, size = 32 }: { name: string; avatar: string | null; size?: number }) {
  if (avatar) {
    return (
      <img
        src={avatar}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-gray-400 to-gray-600 dark:from-zinc-400 dark:to-zinc-600 flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
      style={{ width: size, height: size }}
    >
      {name?.[0] || "?"}
    </div>
  );
}

function PortraitCard({ worker, index, fill }: { worker: MatchedWorker; index: number; fill?: boolean }) {
  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 animate-fade-in-up ${fill ? "w-full aspect-[4/5]" : "w-16 h-20 flex-shrink-0"}`}
      style={{ animationDelay: `${index * 150}ms`, animationFillMode: "both" }}
    >
      {worker.portraitUrl ? (
        <img src={worker.portraitUrl} alt={worker.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-zinc-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      )}
      {/* Avatar overlay bottom-right */}
      <div className="absolute bottom-0.5 right-0.5 rounded-full ring-2 ring-white dark:ring-zinc-900 bg-white dark:bg-zinc-900">
        <SmallAvatar name={worker.name} avatar={worker.avatar} size={16} />
      </div>
    </div>
  );
}

function SkeletonNode({ index }: { index: number }) {
  return (
    <div
      className="flex items-center gap-3 animate-pulse"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="w-16 h-20 rounded-lg bg-gray-200 dark:bg-zinc-700 flex-shrink-0" />
      <div className="space-y-1.5 flex-1">
        <div className="w-16 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
        <div className="w-24 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
      </div>
    </div>
  );
}

export function ConnectPanel({ onAllReady }: ConnectPanelProps) {
  const t = useT();
  const router = useRouter();
  const { data: session } = useSession();
  const credits = useUserStore((s) => s.credits);
  const logoFont = useFontStore((s) => s.logoFont);
  const userAvatar = useUserStore((s) => s.avatar);
  const userName = useUserStore((s) => s.name);

  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [workers, setWorkers] = useState<MatchedWorker[]>([]);
  const [skeletonCount, setSkeletonCount] = useState(3);
  const [specialImage, setSpecialImage] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);
  const [gameRoomId, setGameRoomId] = useState<string | null>(null);

  // Portrait-specific state
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitLoading, setPortraitLoading] = useState(false);

  const loadedCountRef = useRef(0);

  const SAMPLE_CHIPS = t.panel.chatChips;
  const CHIP_GROUPS = t.panel.chatChipGroups;
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);

  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };

  // Fire onAllReady when matching is done (skip for game — user clicks casino image instead)
  useEffect(() => {
    if (phase === "done" && workers.length > 0 && onAllReady && intent !== "game") {
      const timer = setTimeout(() => onAllReady(postId), 800);
      return () => clearTimeout(timer);
    }
  }, [phase, workers.length, onAllReady, postId, intent]);

  // ---- Dispatch functions that return matched workers ----

  const dispatchConsult = async (q: string): Promise<MatchedWorker[]> => {
    const res = await fetch("/api/v1/plaza", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: q }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Failed");
    setPostId(data.post?.id || null);

    const candidates = data.candidates || [];
    return candidates
      .filter((c: { userId?: string; name?: string }) => c.userId && c.name)
      .map((c: { userId: string; name: string; avatar: string | null }) => ({
        id: c.userId,
        name: c.name,
        avatar: c.avatar,
      }));
  };

  const dispatchTask = async (q: string, category: "WRITING" | "PAINTING"): Promise<MatchedWorker[]> => {
    const res = await fetch("/api/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: q, category }),
    });
    const data = await res.json();
    if (data.error || data.message) throw new Error(data.error || data.message);
    setPostId(data.postId || null);

    return (data.tasks || [])
      .filter((t: { worker?: { id?: string } }) => t.worker?.id)
      .map((t: { worker: { id: string; name: string; avatar: string | null } }) => ({
        id: t.worker.id,
        name: t.worker.name,
        avatar: t.worker.avatar,
      }));
  };

  const dispatchGame = async (): Promise<MatchedWorker[]> => {
    const res = await fetch("/api/v1/games/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gameType: "TEXAS_HOLDEM", maxPlayers: 6, minChips: 10, totalRounds: 5 }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Failed");

    setSpecialImage("/images/casino.jpg");
    setGameRoomId(data.room?.id || null);
    setPostId(data.postId || null);

    return (data.room?.players || [])
      .filter((p: { userId?: string; user?: { name?: string } }) => p.userId && p.userId !== session?.user?.id && p.user?.name)
      .map((p: { userId: string; user: { name: string; avatar: string | null } }) => ({
        id: p.userId,
        name: p.user.name,
        avatar: p.user.avatar,
      }));
  };

  const dispatchPortrait = async (): Promise<MatchedWorker[]> => {
    setPortraitLoading(true);

    // Check if user already has a portrait
    try {
      const getRes = await fetch("/api/v1/portrait");
      const getData = await getRes.json();
      if (getData.portraitUrl) {
        setPortraitUrl(getData.portraitUrl);
      }
    } catch { /* ignore */ }

    // Generate (creates Post + Task, async generation)
    const postRes = await fetch("/api/v1/portrait", { method: "POST" });
    const postData = await postRes.json();
    if (!postData.success) throw new Error("Portrait generation failed");

    setPostId(postData.postId || null);
    setPortraitLoading(false);

    return [{ id: session?.user?.id || "self", name: userName || "Me", avatar: userAvatar, portraitUrl: portraitUrl }];
  };

  // ---- Fetch portrait URLs for matched workers ----
  const enrichWithPortraits = async (matched: MatchedWorker[]): Promise<MatchedWorker[]> => {
    // Batch fetch portrait URLs from user profiles
    const enriched = await Promise.all(
      matched.map(async (w) => {
        try {
          const res = await fetch(`/api/v1/plaza/${postId || "none"}?workerPortrait=${w.id}`);
          // If the API doesn't support this, just return without portrait
          return w;
        } catch {
          return w;
        }
      })
    );
    return enriched;
  };

  // ---- Main submit handler ----

  const handleSubmit = async () => {
    if (!session) return handleLogin();
    if (!input.trim()) return;

    const userInput = input.trim();
    setQuery(userInput);
    setPhase("recognizing");
    setError(null);
    setWorkers([]);
    setSpecialImage(null);
    setPostId(null);
    setPortraitUrl(null);
    setSkeletonCount(3);

    try {
      // Step 1: Intent recognition
      const intentRes = await fetch("/api/v1/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: userInput }),
      });
      const intentData = await intentRes.json();

      if (!intentData.success) {
        setError(intentData.message || t.panel.networkError);
        setPhase("input");
        return;
      }

      const recognizedIntent: Intent = intentData.intent;
      const recognizedQuery = intentData.query || userInput;
      setIntent(recognizedIntent);
      setQuery(recognizedQuery);
      setPhase("matching");

      // Set expected skeleton count based on intent
      if (recognizedIntent === "portrait") setSkeletonCount(1);
      else if (recognizedIntent === "game") setSkeletonCount(3);
      else setSkeletonCount(3);

      // Step 2: Dispatch to backend
      let matched: MatchedWorker[];
      switch (recognizedIntent) {
        case "consult":
          matched = await dispatchConsult(recognizedQuery);
          break;
        case "writing":
          matched = await dispatchTask(recognizedQuery, "WRITING");
          break;
        case "painting":
          matched = await dispatchTask(recognizedQuery, "PAINTING");
          break;
        case "game":
          matched = await dispatchGame();
          break;
        case "portrait":
          matched = await dispatchPortrait();
          break;
      }

      setWorkers(matched);
      setPhase("done");
      setInput("");
    } catch (err) {
      setError((err as Error).message || t.panel.networkError);
      setPhase("input");
    }
  };

  // ---- Input phase ----
  if (phase === "input") {
    return (
      <section id="connect-panel" className="w-full max-w-2xl mx-auto scroll-mt-20">
        <div className="bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800/80 rounded-2xl shadow-lg dark:shadow-zinc-900/50 overflow-hidden backdrop-blur-sm">
          <div className="p-4 sm:p-6 space-y-4">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.panel.smartPlaceholder}
              className="w-full h-28 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 resize-none input-focus focus:outline-none transition-all"
            />

            <div className="space-y-2.5">
              {/* Quick actions */}
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => setInput(chip)}
                    className="px-3 py-1.5 text-xs bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/30 dark:to-indigo-900/30 text-violet-700 dark:text-violet-300 rounded-full border border-violet-200 dark:border-violet-800/60 hover:border-violet-400 dark:hover:border-violet-600 hover:-translate-y-0.5 transition-all duration-200"
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Scene tags */}
              <div className="flex flex-wrap gap-1.5">
                {CHIP_GROUPS.map((group, idx) => (
                  <button
                    key={group.label}
                    onClick={() => setExpandedGroup(expandedGroup === idx ? null : idx)}
                    className={`px-2.5 py-1 text-xs rounded-full border transition-all duration-200 ${
                      expandedGroup === idx
                        ? "bg-gray-900 dark:bg-white text-white dark:text-zinc-900 border-gray-900 dark:border-white"
                        : "bg-gray-50 dark:bg-zinc-800/80 text-gray-500 dark:text-zinc-400 border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500"
                    }`}
                  >
                    {group.label}
                  </button>
                ))}
              </div>

              {/* Expanded chips */}
              {expandedGroup !== null && (
                <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                  {CHIP_GROUPS[expandedGroup].chips.map((chip) => (
                    <button
                      key={chip}
                      onClick={() => { setInput(chip); setExpandedGroup(null); }}
                      className="text-left px-3 py-2 text-xs bg-gray-50 dark:bg-zinc-800/80 text-gray-600 dark:text-zinc-400 rounded-lg border border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-700/80 transition-all duration-200 truncate"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {session && (
              <div className="text-sm text-gray-500 dark:text-zinc-400">
                {t.panel.balance} {credits} credit
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-black text-base sm:text-lg font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
              style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}
            >
              {!session ? t.panel.loginToUse : "Connect"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ---- Tree-style matching view (recognizing / matching / done) ----
  return (
    <section id="connect-panel" className="w-full max-w-2xl mx-auto scroll-mt-20">
      <div className="bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800/80 rounded-2xl shadow-lg dark:shadow-zinc-900/50 overflow-hidden backdrop-blur-sm">
        <div className="p-4 sm:p-6">
          {/* Query row: avatar → line → query text */}
          <div className="flex items-start gap-0">
            {/* Left: user avatar + vertical line */}
            <div className="flex flex-col items-center flex-shrink-0 w-10">
              <SmallAvatar name={userName || "U"} avatar={userAvatar} size={32} />
              <div className="w-px flex-1 min-h-[20px] bg-gray-200 dark:bg-zinc-700 mt-1" />
            </div>

            {/* Horizontal connector */}
            <div className="w-4 h-px bg-gray-200 dark:bg-zinc-700 mt-4 flex-shrink-0" />

            {/* Query content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-gray-900 dark:text-white">{userName || "Me"}</span>
                {phase === "recognizing" && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-zinc-500">
                    <div className="w-3 h-3 border-2 border-gray-300 dark:border-zinc-600 border-t-transparent rounded-full animate-spin" />
                    {t.panel.recognizing}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed">{query}</p>
            </div>
          </div>

          {/* Task nodes (indented under vertical line) */}
          <div className="ml-5 pl-5 border-l border-gray-200 dark:border-zinc-700">
            {/* Skeleton nodes while matching */}
            {(phase === "recognizing" || phase === "matching") && workers.length === 0 && (
              <div className="space-y-3 py-3">
                {Array.from({ length: skeletonCount }).map((_, i) => (
                  <SkeletonNode key={i} index={i} />
                ))}
              </div>
            )}

            {/* Portrait loading (special case) */}
            {phase === "matching" && intent === "portrait" && portraitLoading && (
              <div className="py-3">
                <div className="w-16 h-20 rounded-lg bg-gray-200 dark:bg-zinc-700 animate-pulse flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400 dark:text-zinc-500">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </div>
              </div>
            )}

            {/* Game layout: casino image left + players grid right */}
            {specialImage && workers.length > 0 && (
              <div className="py-3 animate-fade-in-up" style={{ animationFillMode: "both" }}>
                <div className="flex gap-3">
                  {/* Casino image (clickable when done → enter game) */}
                  <div
                    className={`w-[120px] h-[168px] rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 flex-shrink-0 animate-fade-in-up transition-all ${
                      phase === "done" && gameRoomId ? "cursor-pointer hover:scale-105 hover:shadow-lg hover:ring-2 hover:ring-gray-400/50 dark:hover:ring-zinc-500/50" : ""
                    }`}
                    style={{ animationFillMode: "both" }}
                    onClick={() => { if (phase === "done" && gameRoomId) router.push(`/games/${gameRoomId}`); }}
                  >
                    <img src={specialImage} alt="casino" className="w-full h-full object-cover" />
                  </div>
                  {/* Players grid 3 per row */}
                  <div className="flex-1 grid grid-cols-3 gap-1.5 content-start">
                    {workers.map((w, i) => (
                      <PortraitCard key={w.id} worker={w} index={i} fill />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Normal layout: horizontal scroll (non-game) */}
            {!specialImage && workers.length > 0 && (
              <div className="py-3">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {workers.map((w, i) => (
                    <PortraitCard key={w.id} worker={w} index={i} />
                  ))}
                </div>
              </div>
            )}

            {/* Error in matching phase */}
            {error && (
              <div className="py-2">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
