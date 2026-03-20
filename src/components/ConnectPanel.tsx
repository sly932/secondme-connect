"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useUserStore, useFontStore, LOGO_FONT_CSS } from "@/lib/store";
import { GameCreatingOverlay } from "@/components/GameCreatingOverlay";
import { TaskCreatingOverlay } from "@/components/TaskCreatingOverlay";
import { useT } from "@/lib/i18n";

type Intent = "consult" | "writing" | "painting" | "game" | "portrait";

export function ConnectPanel() {
  const t = useT();
  const { data: session } = useSession();
  const router = useRouter();
  const credits = useUserStore((s) => s.credits);
  const logoFont = useFontStore((s) => s.logoFont);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overlay states (reuse existing overlays)
  const [submittingType, setSubmittingType] = useState<"chat" | "writing" | "painting" | null>(null);
  const [submitApiDone, setSubmitApiDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSummary, setSubmitSummary] = useState<string | null>(null);

  const [creatingGame, setCreatingGame] = useState<string | null>(null);
  const [gameApiDone, setGameApiDone] = useState(false);
  const [gameCreateError, setGameCreateError] = useState<string | null>(null);
  const pendingRoomId = useRef<string | null>(null);

  const SAMPLE_CHIPS = t.panel.chatChips;

  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };

  // ---- Intent-based dispatch ----

  const dispatchConsult = async (query: string) => {
    setSubmittingType("chat");
    setSubmitApiDone(false);
    setSubmitError(null);
    setSubmitSummary(null);

    try {
      const res = await fetch("/api/v1/plaza", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: query }),
      });
      const data = await res.json();

      if (data.success) {
        const msg = data.tasks?.length
          ? t.panel.consultSent.replace("{count}", String(data.tasks.length))
          : data.matchCount > 0
            ? t.panel.matchFound.replace("{count}", String(data.matchCount))
            : t.panel.publishedToPlaza;
        setSubmitSummary(msg);
        setSubmitApiDone(true);
        setInput("");
        setTimeout(() => { router.push("/plaza"); setSubmittingType(null); }, 1200);
      } else {
        setSubmitError(data.message || t.panel.publishFailed);
        setTimeout(() => setSubmittingType(null), 2500);
      }
    } catch {
      setSubmitError(t.panel.networkError);
      setTimeout(() => setSubmittingType(null), 2500);
    }
  };

  const dispatchTask = async (query: string, category: "WRITING" | "PAINTING") => {
    const type = category === "WRITING" ? "writing" as const : "painting" as const;
    setSubmittingType(type);
    setSubmitApiDone(false);
    setSubmitError(null);
    setSubmitSummary(null);

    try {
      const res = await fetch("/api/v1/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: query, category }),
      });
      const data = await res.json();

      if (data.tasks?.length) {
        setSubmitSummary(t.panel.assignedTo.replace("{count}", String(data.tasks.length)));
        setSubmitApiDone(true);
        setInput("");
        setTimeout(() => { router.push("/plaza"); setSubmittingType(null); }, 1200);
      } else if (data.error || data.message?.includes("不足")) {
        setSubmitError(data.error || data.message || t.panel.createFailed);
        setTimeout(() => setSubmittingType(null), 2500);
      } else {
        setSubmitSummary(t.panel.taskCreated);
        setSubmitApiDone(true);
        setInput("");
        setTimeout(() => setSubmittingType(null), 1500);
      }
    } catch {
      setSubmitError(t.panel.networkError);
      setTimeout(() => setSubmittingType(null), 2500);
    }
  };

  const dispatchGame = async () => {
    const type = "BLACKJACK";
    setCreatingGame(type);
    setGameApiDone(false);
    setGameCreateError(null);

    try {
      const res = await fetch("/api/v1/games/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameType: type, maxPlayers: 4, minChips: 10, totalRounds: 5 }),
      });
      const data = await res.json();
      if (data.success) {
        pendingRoomId.current = data.room.id;
        setGameApiDone(true);
        setTimeout(() => router.push(`/games/${data.room.id}`), 800);
      } else {
        setGameCreateError(data.message || t.panel.createFailed);
        setTimeout(() => { setCreatingGame(null); setGameCreateError(null); }, 2000);
      }
    } catch {
      setGameCreateError(t.panel.networkError);
      setTimeout(() => { setCreatingGame(null); setGameCreateError(null); }, 2000);
    }
  };

  const dispatchPortrait = async () => {
    setSubmittingType("painting");
    setSubmitApiDone(false);
    setSubmitError(null);
    setSubmitSummary(null);

    try {
      const res = await fetch("/api/v1/portrait", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setSubmitSummary(t.panel.portraitGenerated);
        setSubmitApiDone(true);
        setInput("");
        setTimeout(() => setSubmittingType(null), 2000);
      } else {
        setSubmitError(data.message || t.panel.createFailed);
        setTimeout(() => setSubmittingType(null), 2500);
      }
    } catch {
      setSubmitError(t.panel.networkError);
      setTimeout(() => setSubmittingType(null), 2500);
    }
  };

  const handleSubmit = async () => {
    if (!session) return handleLogin();
    if (!input.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Step 1: 意图识别
      const intentRes = await fetch("/api/v1/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: input.trim() }),
      });
      const intentData = await intentRes.json();

      if (!intentData.success) {
        setError(intentData.message || t.panel.networkError);
        setLoading(false);
        return;
      }

      const intent: Intent = intentData.intent;
      const query: string = intentData.query || input.trim();

      setLoading(false);

      // Step 2: 路由到对应接口
      switch (intent) {
        case "consult":
          return dispatchConsult(query);
        case "writing":
          return dispatchTask(query, "WRITING");
        case "painting":
          return dispatchTask(query, "PAINTING");
        case "game":
          return dispatchGame();
        case "portrait":
          return dispatchPortrait();
      }
    } catch {
      setError(t.panel.networkError);
      setLoading(false);
    }
  };

  // Show overlay if dispatching
  if (submittingType) {
    return (
      <section id="connect-panel" className="w-full max-w-2xl mx-auto scroll-mt-20">
        <div className="bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800/80 rounded-2xl shadow-lg dark:shadow-zinc-900/50 overflow-hidden backdrop-blur-sm">
          <div className="p-4 sm:p-6">
            <TaskCreatingOverlay
              type={submittingType}
              apiDone={submitApiDone}
              error={submitError}
              summary={submitSummary ?? undefined}
            />
          </div>
        </div>
      </section>
    );
  }

  if (creatingGame) {
    return (
      <section id="connect-panel" className="w-full max-w-2xl mx-auto scroll-mt-20">
        <div className="bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800/80 rounded-2xl shadow-lg dark:shadow-zinc-900/50 overflow-hidden backdrop-blur-sm">
          <div className="p-4 sm:p-6">
            <GameCreatingOverlay
              gameLabel={t.panel.blackjack}
              playerCount={4}
              apiDone={gameApiDone}
              error={gameCreateError}
            />
          </div>
        </div>
      </section>
    );
  }

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

          <div className="flex flex-wrap gap-2">
            {SAMPLE_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => setInput(chip)}
                className="px-3 py-1.5 text-xs bg-gray-50 dark:bg-zinc-800/80 text-gray-600 dark:text-zinc-400 rounded-full border border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500 hover:bg-gray-100 dark:hover:bg-zinc-700/80 hover:-translate-y-0.5 transition-all duration-200"
              >
                {chip}
              </button>
            ))}
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
            disabled={loading || !input.trim()}
            className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-black text-base sm:text-lg font-semibold rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
            style={{ fontFamily: LOGO_FONT_CSS[logoFont] }}
          >
            {loading
              ? t.panel.recognizing
              : !session
                ? t.panel.loginToUse
                : "Connect"}
          </button>
        </div>
      </div>
    </section>
  );
}
