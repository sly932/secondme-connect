"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useT } from "@/lib/i18n";

// ---- Types ----

interface Author {
  id: string;
  name: string;
  avatar: string | null;
  isNpc?: boolean;
}

interface TaskInfo {
  taskId: string;
  type: string;
  category: string | null;
  status: string;
  result: string | null;
  resultUrl: string | null;
}

interface MatchCard {
  userId: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  similarity: number;
  portraitUrl?: string | null;
  task: TaskInfo | null;
}

interface Comment {
  id: string;
  content: string;
  author: Author;
  createdAt: string;
}

export interface FeedPost {
  id: string;
  content: string;
  author: Author;
  commentCount: number;
  matchCount: number;
  taskCategory: string | null;
  taskType: string;
  createdAt: string;
}

interface FeedItemProps {
  post: FeedPost;
  defaultExpanded?: boolean;
  now: number | null;
}

// ---- Helpers ----

function SmallAvatar({ name, avatar, size = 28 }: { name: string; avatar: string | null; size?: number }) {
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

// ---- Portrait Card (clickable, with hover) ----

function PortraitCard({ card, index, onClick }: { card: MatchCard; index: number; onClick: () => void }) {
  const hasPortrait = !!card.portraitUrl;
  const statusColor =
    card.task?.status === "COMPLETED"
      ? "ring-emerald-400 dark:ring-emerald-500"
      : card.task?.status === "FAILED"
        ? "ring-red-400 dark:ring-red-500"
        : "ring-gray-300 dark:ring-zinc-600";

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="relative w-16 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-zinc-800 flex-shrink-0 animate-fade-in-up transition-all duration-200 hover:scale-105 hover:shadow-lg hover:ring-2 hover:ring-gray-400/50 dark:hover:ring-zinc-500/50 focus:outline-none cursor-pointer"
      style={{ animationDelay: `${index * 120}ms`, animationFillMode: "both" }}
    >
      {hasPortrait ? (
        <img src={card.portraitUrl!} alt={card.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-zinc-600">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </div>
      )}
      <div className={`absolute bottom-0.5 right-0.5 rounded-full ring-2 ${statusColor} bg-white dark:bg-zinc-900`}>
        <SmallAvatar name={card.name} avatar={card.avatar} size={18} />
      </div>
    </button>
  );
}

// ---- Detail Modal (swipeable card viewer) ----

function DetailModal({
  cards,
  initialIndex,
  postId,
  postAuthor,
  postContent,
  onClose,
}: {
  cards: MatchCard[];
  initialIndex: number;
  postId: string;
  postAuthor: Author;
  postContent: string;
  onClose: () => void;
}) {
  const t = useT();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [shareView, setShareView] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);
  const touchDeltaX = useRef(0);

  // Slide transition state
  const [slideAnim, setSlideAnim] = useState<"none" | "slide-left" | "slide-right">("none");
  const pendingIndex = useRef<number | null>(null);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/feed?expand=${postId}` : "";

  const card = cards[currentIndex];
  if (!card) return null;

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < cards.length - 1;

  const switchTo = (newIndex: number, direction: "slide-left" | "slide-right") => {
    setShareView(false);
    setSlideAnim(direction);
    pendingIndex.current = newIndex;
    // After exit animation, swap content and do enter animation
    setTimeout(() => {
      setCurrentIndex(newIndex);
      setSlideAnim(direction === "slide-left" ? "slide-right" : "slide-left");
      setTimeout(() => setSlideAnim("none"), 20);
    }, 150);
  };

  const goPrev = () => { if (hasPrev) switchTo(currentIndex - 1, "slide-right"); };
  const goNext = () => { if (hasNext) switchTo(currentIndex + 1, "slide-left"); };

  const [dragOffset, setDragOffset] = useState(0);
  const isDragging = useRef(false);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    isDragging.current = true;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    touchDeltaX.current = delta;
    // Clamp offset and add resistance at edges
    if ((!hasPrev && delta > 0) || (!hasNext && delta < 0)) {
      setDragOffset(delta * 0.3);
    } else {
      setDragOffset(delta);
    }
  };
  const handleTouchEnd = () => {
    isDragging.current = false;
    if (touchDeltaX.current > 60) goPrev();
    else if (touchDeltaX.current < -60) goNext();
    touchDeltaX.current = 0;
    setDragOffset(0);
  };

  // Mouse drag handlers (desktop)
  const handleMouseDown = (e: React.MouseEvent) => {
    touchStartX.current = e.clientX;
    isDragging.current = true;
    e.preventDefault();
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - touchStartX.current;
    touchDeltaX.current = delta;
    if ((!hasPrev && delta > 0) || (!hasNext && delta < 0)) {
      setDragOffset(delta * 0.3);
    } else {
      setDragOffset(delta);
    }
  };
  const handleMouseUp = () => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (touchDeltaX.current > 60) goPrev();
    else if (touchDeltaX.current < -60) goNext();
    touchDeltaX.current = 0;
    setDragOffset(0);
  };
  const handleMouseLeave = () => {
    if (isDragging.current) handleMouseUp();
  };

  const [saving, setSaving] = useState(false);
  const handleSave = useCallback(async () => {
    const el = shareCardRef.current;
    if (!el || saving) return;
    setSaving(true);
    try {
      const { saveShareImage } = await import("@/lib/save-share-image");
      await saveShareImage(el, `${postAuthor.name}-${card.name}.png`);
    } catch (err) {
      console.error("Save share card failed:", err);
    } finally {
      setSaving(false);
    }
  }, [card.name, postAuthor.name, saving]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  const isComplete = card.task?.status === "COMPLETED";
  const isFailed = card.task?.status === "FAILED";
  const isRunning = !isComplete && !isFailed && !!card.task;
  const isPainting = card.task?.category === "PAINTING";
  const isConsult = card.task?.type === "CONSULT";

  // Parse dialogue: "💬 Name：content\n\n💬 Name：content"
  const dialogues = (() => {
    if (!isConsult || !card.task?.result) return null;
    const text = card.task.result;
    const segments = text.split("\n\n").filter((s) => s.trim());
    if (segments.length <= 1) return null;
    return segments.map((seg) => {
      const match = seg.match(/^💬\s*(.+?)：([\s\S]*)$/);
      if (match) {
        return { speaker: match[1].trim(), content: match[2].trim() };
      }
      return { speaker: "", content: seg.trim() };
    });
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[3px] animate-fade-in"
        onClick={onClose}
      />

      {/* Card */}
      <div
        className={`relative w-full max-w-md mx-4 max-h-[85vh] bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200/80 dark:border-zinc-800 shadow-2xl overflow-hidden animate-scale-in flex flex-col select-none ${
          isDragging.current ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{
          transform: dragOffset ? `translateX(${dragOffset}px)` : undefined,
          transition: dragOffset ? "none" : "transform 0.3s ease-out",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Slide transition wrapper */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{
            transform: slideAnim === "slide-left" ? "translateX(-100%)" : slideAnim === "slide-right" ? "translateX(100%)" : "translateX(0)",
            opacity: slideAnim !== "none" ? 0 : 1,
            transition: slideAnim === "none" ? "transform 0.2s ease-out, opacity 0.2s ease-out" : "none",
          }}
        >
        {/* ---- Top: Portrait + Profile ---- */}
        <div className="flex items-start gap-4 p-5 pb-3 border-b border-gray-100 dark:border-zinc-800">
          {/* Portrait */}
          <div className="w-20 h-24 rounded-xl overflow-hidden bg-gray-100 dark:bg-zinc-800 flex-shrink-0">
            {card.portraitUrl ? (
              <img src={card.portraitUrl} alt={card.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <SmallAvatar name={card.name} avatar={card.avatar} size={40} />
              </div>
            )}
          </div>

          {/* Profile info */}
          <div className="flex-1 min-w-0 pt-1">
            <div className="flex items-center gap-2">
              <SmallAvatar name={card.name} avatar={card.avatar} size={22} />
              <span className="text-base font-semibold text-gray-900 dark:text-white truncate">{card.name}</span>
            </div>
            {card.bio && (
              <p className="text-xs text-gray-500 dark:text-zinc-400 mt-1.5 line-clamp-2 leading-relaxed">{card.bio}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300">
                {Math.round(card.similarity * 100)}% {t.feed.similarity}
              </span>
              {card.task && (
                <span className={`text-xs ${
                  isComplete ? "text-emerald-600 dark:text-emerald-400" : isFailed ? "text-red-500" : "text-gray-400 dark:text-zinc-500"
                }`}>
                  {isComplete ? t.feed.completed : isFailed ? t.feed.failed : t.feed.processing}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ---- Bottom: Result content ---- */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Loading */}
          {isRunning && (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400 dark:text-zinc-500">
              <div className="w-6 h-6 border-2 border-gray-300 dark:border-zinc-600 border-t-transparent rounded-full animate-spin mb-3" />
              <span className="text-sm">{t.feed.processing}</span>
            </div>
          )}

          {/* Painting result */}
          {isComplete && isPainting && card.task?.resultUrl && (
            <img
              src={card.task.resultUrl}
              alt="painting"
              className="w-full rounded-xl border border-gray-200 dark:border-zinc-700"
            />
          )}

          {/* Consult dialogue (chat bubbles) */}
          {isComplete && dialogues && (
            <div className="space-y-3">
              {dialogues.map((msg, i) => {
                // Determine side by comparing speaker name to worker name
                const isWorker = msg.speaker !== postAuthor.name;
                return (
                  <div key={i} className={`flex items-end gap-2 ${isWorker ? "justify-start" : "justify-end"}`}>
                    {isWorker && <SmallAvatar name={card.name} avatar={card.avatar} size={24} />}
                    <div
                      className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                        isWorker
                          ? "bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-zinc-200 rounded-bl-md"
                          : "bg-gray-900 dark:bg-white text-white dark:text-black rounded-br-md"
                      }`}
                    >
                      {msg.content}
                    </div>
                    {!isWorker && <SmallAvatar name={postAuthor.name} avatar={postAuthor.avatar} size={24} />}
                  </div>
                );
              })}
            </div>
          )}

          {/* Simple text result (writing or single-line consult) */}
          {isComplete && !isPainting && !dialogues && card.task?.result && (
            <div className="space-y-3">
              <div className="flex items-end gap-2 justify-start">
                <SmallAvatar name={card.name} avatar={card.avatar} size={24} />
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-gray-100 dark:bg-zinc-800 text-sm text-gray-800 dark:text-zinc-200 leading-relaxed whitespace-pre-wrap">
                  {card.task.result}
                </div>
              </div>
            </div>
          )}

          {/* Writing result with image */}
          {isComplete && !isPainting && card.task?.resultUrl && (
            <img
              src={card.task.resultUrl}
              alt="result"
              className="mt-3 w-full rounded-xl border border-gray-200 dark:border-zinc-700"
            />
          )}

          {/* Failed */}
          {isFailed && (
            <div className="flex flex-col items-center justify-center py-8 text-red-400">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mb-2">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <span className="text-sm">{t.feed.failed}</span>
            </div>
          )}
        </div>
        </div>{/* end slide transition wrapper */}

        {/* ---- Bottom bar: nav + save ---- */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-zinc-800">
          {/* Left arrow */}
          <button
            onClick={goPrev}
            disabled={!hasPrev}
            className="p-2 rounded-xl text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Dots (only if multiple cards) */}
          {cards.length > 1 ? (
            <div className="flex items-center gap-1.5">
              {cards.map((_, i) => (
                <button
                  key={i}
                  onClick={() => { setCurrentIndex(i); setShareView(false); }}
                  className={`rounded-full transition-all duration-200 ${
                    i === currentIndex
                      ? "w-5 h-1.5 bg-gray-900 dark:bg-white"
                      : "w-1.5 h-1.5 bg-gray-300 dark:bg-zinc-600 hover:bg-gray-400 dark:hover:bg-zinc-500"
                  }`}
                />
              ))}
            </div>
          ) : <div />}

          {/* Save/Share button */}
          <div className="flex items-center gap-1">
            {isComplete && (
              <button
                onClick={() => setShareView(true)}
                className="p-2 rounded-xl text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 transition-all"
                title={t.feed.share}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
            )}
            <button
              onClick={goNext}
              disabled={!hasNext}
              className="p-2 rounded-xl text-gray-400 dark:text-zinc-500 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100/80 dark:bg-zinc-800/80 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-white transition-all backdrop-blur-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* ---- Share Modal (separate floating window) ---- */}
      {shareView && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setShareView(false)}>
          <div className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-[2px]" />
          <div
            className="relative w-full max-w-xs mx-4 max-h-[80vh] flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200/80 dark:border-zinc-800 shadow-2xl overflow-hidden animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Share card content */}
            <div
              ref={shareCardRef}
              className="overflow-hidden"
              style={{ background: "#ffffff", color: "#111" }}
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-2 text-center">
                <h3 className="text-base font-bold tracking-tight" style={{ color: "#111" }}>Connect</h3>
              </div>

              {/* User query section */}
              <div className="px-5 pb-2">
                <div className="flex items-start gap-2.5">
                  <SmallAvatar name={postAuthor.name} avatar={postAuthor.avatar} size={24} />
                  <div className="flex-1 min-w-0">
                    <span className="text-[11px] font-medium" style={{ color: "#888" }}>{postAuthor.name}</span>
                    <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#333" }}>{postContent}</p>
                  </div>
                </div>
              </div>

              <div className="mx-5" style={{ borderTop: "1px solid #e5e7eb" }} />

              {/* Worker profile + result */}
              <div className="px-5 py-3">
                <div className="flex items-start gap-2.5 mb-3">
                  <div className="w-14 h-[68px] rounded-lg overflow-hidden flex-shrink-0" style={{ background: "#f3f4f6" }}>
                    {card.portraitUrl ? (
                      <img src={card.portraitUrl} alt={card.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <SmallAvatar name={card.name} avatar={card.avatar} size={28} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-1.5">
                      <SmallAvatar name={card.name} avatar={card.avatar} size={16} />
                      <span className="text-xs font-semibold" style={{ color: "#111" }}>{card.name}</span>
                    </div>
                    {card.bio && (
                      <p className="text-[10px] mt-1 line-clamp-2" style={{ color: "#888" }}>{card.bio}</p>
                    )}
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium mt-1"
                      style={{ background: "#f3f4f6", color: "#888" }}
                    >
                      {Math.round(card.similarity * 100)}% {t.feed.similarity}
                    </span>
                  </div>
                </div>

                {isPainting && card.task?.resultUrl && (
                  <img src={card.task.resultUrl} alt="painting" className="w-full rounded-lg" />
                )}
                {!isPainting && card.task?.result && (
                  <div className="rounded-lg p-3 overflow-hidden" style={{ background: "#f9fafb", maxHeight: 200 }}>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "#444" }}>
                      {card.task.result}
                    </p>
                  </div>
                )}
              </div>

              {/* Footer: text + QR code */}
              <div className="px-5 py-3 flex items-end justify-between gap-2" style={{ borderTop: "1px solid #f0f0f0" }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium leading-relaxed" style={{ color: "#444" }}>
                    {(isPainting ? t.feed.shareTextPainting : t.feed.shareText).replace("{name}", card.name)}
                  </p>
                  <p className="mt-0.5 text-[10px]" style={{ color: "#aaa" }}>
                    {t.feed.shareScan}
                  </p>
                </div>
                <div className="flex-shrink-0 rounded-md p-1" style={{ background: "#fff" }}>
                  <div className="w-14 h-14 flex items-center justify-center">
                    <QRBlock url={shareUrl} />
                  </div>
                </div>
              </div>
            </div>

            {/* Save button (below card) */}
            <div className="flex justify-center py-3" style={{ borderTop: "1px solid #f0f0f0" }}>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center justify-center gap-1.5 px-6 py-2 text-sm font-medium rounded-xl transition-all ${
                  saving
                    ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                    : "text-white bg-gray-900 hover:bg-gray-800 active:scale-[0.98]"
                }`}
              >
                {saving ? (
                  <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                {saving ? t.feed.savingImage : t.feed.saveImage}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Simple QR code block using inline SVG data
function QRBlock({ url }: { url: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [QRComponent, setQR] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import("qrcode.react").then((mod) => {
      const Comp = mod.QRCodeSVG;
      setQR(() => Comp);
    });
  }, []);
  if (!QRComponent) {
    return <div className="w-16 h-16 bg-gray-200 dark:bg-zinc-700 rounded animate-pulse" />;
  }
  return <QRComponent value={url} size={64} level="M" />;
}

// ---- Scene Image Modal ----

function SceneModal({
  sceneImageUrl,
  postAuthor,
  workerNames,
  onClose,
}: {
  sceneImageUrl: string;
  postAuthor: Author;
  workerNames: string[];
  onClose: () => void;
}) {
  const t = useT();
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  const nameList = workerNames.length > 3
    ? `${workerNames.slice(0, 3).join("、")}等${workerNames.length}人`
    : workerNames.join("、");

  const shareText = `${postAuthor.name}的分身在 Connect 和${nameList}的分身开了一场圆桌会议，快来围观吧！`;

  const handleSave = useCallback(async () => {
    const el = shareCardRef.current;
    if (!el || saving) return;
    setSaving(true);
    try {
      const { saveShareImage } = await import("@/lib/save-share-image");
      await saveShareImage(el, `scene-${postAuthor.name}.png`);
    } catch (err) {
      console.error("Save scene card failed:", err);
    } finally {
      setSaving(false);
    }
  }, [saving, postAuthor.name]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[3px] animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm mx-4 max-h-[85vh] flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200/80 dark:border-zinc-800 shadow-2xl overflow-hidden animate-scale-in">
        {/* Share card content */}
        <div
          ref={shareCardRef}
          className="overflow-hidden"
          style={{ background: "#ffffff", color: "#111" }}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-2 text-center">
            <h3 className="text-base font-bold tracking-tight" style={{ color: "#111" }}>Connect</h3>
          </div>

          {/* Scene image */}
          <div className="px-4 pb-3">
            <img
              src={sceneImageUrl}
              alt="scene"
              className="w-full rounded-xl"
            />
          </div>

          {/* Participants */}
          <div className="px-5 pb-2">
            <div className="flex items-center gap-1.5">
              <SmallAvatar name={postAuthor.name} avatar={postAuthor.avatar} size={20} />
              <span className="text-xs font-medium" style={{ color: "#111" }}>{postAuthor.name}</span>
              <span className="text-[10px]" style={{ color: "#aaa" }}>与 {nameList}</span>
            </div>
          </div>

          {/* Footer: share text + QR code */}
          <div className="px-5 py-3 flex items-end justify-between gap-2" style={{ borderTop: "1px solid #f0f0f0" }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium leading-relaxed" style={{ color: "#444" }}>
                {shareText}
              </p>
              <p className="mt-0.5 text-[10px]" style={{ color: "#aaa" }}>
                {t.feed.shareScan}
              </p>
            </div>
            <div className="flex-shrink-0 rounded-md p-1" style={{ background: "#fff" }}>
              <div className="w-14 h-14 flex items-center justify-center">
                <QRBlock url={siteUrl} />
              </div>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-center py-3" style={{ borderTop: "1px solid #f0f0f0" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center justify-center gap-1.5 px-6 py-2 text-sm font-medium rounded-xl transition-all ${
              saving
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "text-white bg-gray-900 hover:bg-gray-800 active:scale-[0.98]"
            }`}
          >
            {saving ? (
              <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {saving ? t.feed.savingImage : t.feed.saveImage}
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100/80 dark:bg-zinc-800/80 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-white transition-all backdrop-blur-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---- Portrait Share Modal (QR → homepage) ----

function PortraitShareModal({
  portraitUrl,
  authorName,
  authorAvatar,
  onClose,
}: {
  portraitUrl: string;
  authorName: string;
  authorAvatar: string | null;
  onClose: () => void;
}) {
  const t = useT();
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleSave = useCallback(async () => {
    const el = shareCardRef.current;
    if (!el || saving) return;
    setSaving(true);
    try {
      const { saveShareImage } = await import("@/lib/save-share-image");
      await saveShareImage(el, `${authorName}-自画像.png`);
    } catch (err) {
      console.error("Save portrait card failed:", err);
    } finally {
      setSaving(false);
    }
  }, [saving, authorName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 dark:bg-black/60 backdrop-blur-[3px] animate-fade-in"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm mx-4 max-h-[85vh] flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200/80 dark:border-zinc-800 shadow-2xl overflow-hidden animate-scale-in">
        <div
          ref={shareCardRef}
          className="overflow-hidden"
          style={{ background: "#ffffff", color: "#111" }}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-2 text-center">
            <h3 className="text-base font-bold tracking-tight" style={{ color: "#111" }}>Connect</h3>
          </div>

          {/* Portrait image */}
          <div className="px-6 pb-3 flex justify-center">
            <div className="w-56 h-56 rounded-xl overflow-hidden">
              <img src={portraitUrl} alt="portrait" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Author */}
          <div className="px-5 pb-2 flex items-center justify-center gap-1.5">
            <SmallAvatar name={authorName} avatar={authorAvatar} size={20} />
            <span className="text-xs font-medium" style={{ color: "#111" }}>{authorName}</span>
          </div>

          {/* Footer: share text + QR code (→ homepage) */}
          <div className="px-5 py-3 flex items-end justify-between gap-2" style={{ borderTop: "1px solid #f0f0f0" }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium leading-relaxed" style={{ color: "#444" }}>
                {t.nav.portraitShareText}
              </p>
              <p className="mt-0.5 text-[10px]" style={{ color: "#aaa" }}>
                {t.nav.portraitShareScan}
              </p>
            </div>
            <div className="flex-shrink-0 rounded-md p-1" style={{ background: "#fff" }}>
              <div className="w-14 h-14 flex items-center justify-center">
                <QRBlock url={siteUrl} />
              </div>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-center py-3" style={{ borderTop: "1px solid #f0f0f0" }}>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center justify-center gap-1.5 px-6 py-2 text-sm font-medium rounded-xl transition-all ${
              saving
                ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                : "text-white bg-gray-900 hover:bg-gray-800 active:scale-[0.98]"
            }`}
          >
            {saving ? (
              <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            )}
            {saving ? t.feed.savingImage : t.feed.saveImage}
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full bg-gray-100/80 dark:bg-zinc-800/80 text-gray-500 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700 hover:text-gray-900 dark:hover:text-white transition-all backdrop-blur-sm"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ---- Main Component ----

export function FeedItem({ post, defaultExpanded = false, now }: FeedItemProps) {
  const t = useT();
  const { data: session } = useSession();
  const itemRef = useRef<HTMLDivElement>(null);

  const [expanded, setExpanded] = useState(defaultExpanded);

  // 通过二维码跳转时，自动滚动到该帖子
  useEffect(() => {
    if (defaultExpanded && itemRef.current) {
      setTimeout(() => {
        itemRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    }
  }, [defaultExpanded]);
  const [matchCards, setMatchCards] = useState<MatchCard[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [sceneImageUrl, setSceneImageUrl] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Modal state
  const [modalIndex, setModalIndex] = useState<number | null>(null);
  const [sceneModalOpen, setSceneModalOpen] = useState(false);
  const [portraitModalOpen, setPortraitModalOpen] = useState(false);

  const isPortrait = post.taskType === "PORTRAIT";

  const sseCleanupRef = useRef<(() => void) | null>(null);
  const cacheRef = useRef<{ matchCards: MatchCard[]; comments: Comment[]; sceneImageUrl: string | null; fetchedAt: number } | null>(null);

  useEffect(() => {
    return () => { sseCleanupRef.current?.(); };
  }, []);

  const fetchDetail = useCallback(async (skipCache = false) => {
    if (!skipCache && cacheRef.current) {
      const age = Date.now() - cacheRef.current.fetchedAt;
      const hasInProgress = cacheRef.current.matchCards.some(
        (c) => c.task && !["COMPLETED", "FAILED", "CANCELLED"].includes(c.task.status)
      );
      if (!hasInProgress && age < 5 * 60 * 1000) {
        setMatchCards(cacheRef.current.matchCards);
        setComments(cacheRef.current.comments);
        setSceneImageUrl(cacheRef.current.sceneImageUrl);
        return cacheRef.current.matchCards;
      }
    }

    setDetailLoading(true);
    try {
      const res = await fetch(`/api/v1/plaza/${post.id}`);
      const data = await res.json();
      if (data.success) {
        const cards: MatchCard[] = data.matchCards || [];
        setMatchCards(cards);
        setComments(data.comments || []);
        setSceneImageUrl(data.sceneImageUrl || null);
        cacheRef.current = { matchCards: cards, comments: data.comments || [], sceneImageUrl: data.sceneImageUrl || null, fetchedAt: Date.now() };
        return cards;
      }
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
    return [];
  }, [post.id]);

  const startSSE = useCallback((cards: MatchCard[]) => {
    sseCleanupRef.current?.();
    const inProgress = cards.filter(
      (c) => c.task && !["COMPLETED", "FAILED", "CANCELLED"].includes(c.task.status)
    );
    if (inProgress.length === 0) return;

    const sources: EventSource[] = [];
    for (const card of inProgress) {
      if (!card.task) continue;
      const taskId = card.task.taskId;
      const es = new EventSource(`/api/v1/tasks/${taskId}/stream`);

      es.onmessage = (e) => {
        if (e.data === "[DONE]") {
          es.close();
          cacheRef.current = null;
          fetchDetail(true).then(startSSE);
          return;
        }
        try {
          const event = JSON.parse(e.data);
          setMatchCards((prev) =>
            prev.map((c) =>
              c.task?.taskId === taskId
                ? { ...c, task: { ...c.task!, result: event.result ?? c.task!.result, status: event.status ?? c.task!.status, resultUrl: event.resultUrl ?? c.task!.resultUrl } }
                : c
            )
          );
        } catch { /* ignore */ }
      };
      es.onerror = () => es.close();
      sources.push(es);
    }
    sseCleanupRef.current = () => sources.forEach((es) => es.close());
  }, [fetchDetail]);

  const toggleExpand = async () => {
    if (expanded) {
      sseCleanupRef.current?.();
      sseCleanupRef.current = null;
      setExpanded(false);
      return;
    }
    setExpanded(true);
    const cards = await fetchDetail();
    startSSE(cards);
  };

  useEffect(() => {
    if (defaultExpanded && matchCards.length === 0) {
      fetchDetail().then(startSSE);
    }
  }, [defaultExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComment = async () => {
    const content = commentText.trim();
    if (!content || submitting) return;

    const tempComment: Comment = {
      id: `temp-${Date.now()}`,
      content,
      author: {
        id: session?.user?.id || "",
        name: session?.user?.name || "",
        avatar: (session?.user as { avatar?: string | null })?.avatar ?? null,
      },
      createdAt: new Date().toISOString(),
    };

    setCommentText("");
    setComments((prev) => [...prev, tempComment]);
    setSubmitting(true);

    try {
      const res = await fetch(`/api/v1/plaza/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setComments((prev) => prev.map((c) => (c.id === tempComment.id ? data.comment : c)));
      } else {
        setComments((prev) => prev.filter((c) => c.id !== tempComment.id));
        setCommentText(content);
      }
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== tempComment.id));
      setCommentText(content);
    } finally {
      setSubmitting(false);
    }
  };

  function timeAgo(date: string) {
    if (!now) return "";
    const diff = now - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t.plaza.timeAgo.justNow;
    if (mins < 60) return t.plaza.timeAgo.minutesAgo.replace("{n}", String(mins));
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t.plaza.timeAgo.hoursAgo.replace("{n}", String(hours));
    return t.plaza.timeAgo.daysAgo.replace("{n}", String(Math.floor(hours / 24)));
  }

  const TASK_ICONS: Record<string, string> = {
    CONSULT: "💬",
    WRITING: "✍️",
    PAINTING: "🎨",
  };

  const taskIcon = TASK_ICONS[post.taskCategory || post.taskType] || "💬";

  return (
    <div ref={itemRef}>
      {/* ---- Feed card with hover effect ---- */}
      <div className="rounded-xl border border-transparent hover:border-gray-200 dark:hover:border-zinc-700/80 hover:bg-gray-50/50 dark:hover:bg-zinc-900/50 hover:shadow-sm transition-all duration-200 px-3 py-3 -mx-3 cursor-pointer">
        {/* Query row: avatar → line → content */}
        <div className="flex items-start gap-0" onClick={toggleExpand}>
          {/* Left: avatar + vertical line */}
          <div className="flex flex-col items-center flex-shrink-0 w-10">
            <SmallAvatar name={post.author.name} avatar={post.author.avatar} size={32} />
            {(expanded || post.matchCount > 0) && (
              <div className="w-px flex-1 min-h-[16px] bg-gray-200 dark:bg-zinc-700 mt-1" />
            )}
          </div>

          {/* Horizontal connector */}
          <div className="w-4 h-px bg-gray-200 dark:bg-zinc-700 mt-4 flex-shrink-0" />

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{post.author.name}</span>
              <span className="text-xs text-gray-400 dark:text-zinc-500">{timeAgo(post.createdAt)}</span>
              <span className="text-xs">{taskIcon}</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-zinc-300 leading-relaxed line-clamp-3">
              {post.content}
            </p>
            {!expanded && post.matchCount > 0 && (
              <div className="mt-1.5 text-xs text-gray-400 dark:text-zinc-500">
                {post.matchCount} {t.feed.matches} · {post.commentCount} {t.feed.comments}
              </div>
            )}
          </div>
        </div>

        {/* ---- Expanded: portrait cards + comments ---- */}
        {expanded && (
          <div className="ml-5 pl-5 border-l border-gray-200 dark:border-zinc-700">
            {/* Loading skeleton */}
            {detailLoading && matchCards.length === 0 && (
              <div className="space-y-3 py-2 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-16 h-20 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                    <div className="space-y-1.5 flex-1">
                      <div className="w-20 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                      <div className="w-32 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scene image (if available) */}
            {sceneImageUrl && (
              <div className="py-2">
                <img
                  src={sceneImageUrl}
                  alt="scene"
                  className="w-full rounded-xl border border-gray-200 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setSceneModalOpen(true)}
                />
              </div>
            )}

            {/* Portrait: show result image directly (clickable) */}
            {isPortrait && !sceneImageUrl && matchCards.length > 0 && matchCards[0]?.task?.resultUrl && (
              <div className="py-2">
                <img
                  src={matchCards[0].task.resultUrl}
                  alt="portrait"
                  className="w-full max-w-[200px] rounded-xl border border-gray-200 dark:border-zinc-700 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setPortraitModalOpen(true)}
                />
              </div>
            )}

            {/* Portrait cards row — hidden when scene image exists */}
            {!sceneImageUrl && !isPortrait && matchCards.length > 0 && (
              <div className="py-2">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {matchCards.map((card, i) => (
                    <PortraitCard
                      key={card.userId}
                      card={card}
                      index={i}
                      onClick={() => setModalIndex(i)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Comments */}
            {comments.length > 0 && (
              <div className="border-t border-gray-100 dark:border-zinc-800 mt-2 pt-2 space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <SmallAvatar name={c.author.name} avatar={c.author.avatar} size={20} />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">{c.author.name}</span>
                      <p className="text-sm text-gray-700 dark:text-zinc-300">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Comment input */}
            {session && expanded && (
              <div className="flex items-center gap-2 mt-2 pb-1">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleComment()}
                  placeholder={t.feed.commentPlaceholder}
                  className="flex-1 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none input-focus transition-all"
                />
                <button
                  onClick={handleComment}
                  disabled={!commentText.trim() || submitting}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg disabled:opacity-40 hover:bg-gray-800 dark:hover:bg-zinc-200 transition-all active:scale-95"
                >
                  {t.feed.send}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ---- Detail Modal ---- */}
      {modalIndex !== null && matchCards.length > 0 && (
        <DetailModal
          cards={matchCards}
          initialIndex={modalIndex}
          postId={post.id}
          postAuthor={post.author}
          postContent={post.content}
          onClose={() => setModalIndex(null)}
        />
      )}

      {/* ---- Scene Image Modal ---- */}
      {sceneModalOpen && sceneImageUrl && (
        <SceneModal
          sceneImageUrl={sceneImageUrl}
          postAuthor={post.author}
          workerNames={matchCards.map((c) => c.name)}
          onClose={() => setSceneModalOpen(false)}
        />
      )}

      {/* ---- Portrait Modal (reuse SceneModal style, QR → homepage) ---- */}
      {portraitModalOpen && matchCards[0]?.task?.resultUrl && (
        <PortraitShareModal
          portraitUrl={matchCards[0].task.resultUrl}
          authorName={post.author.name}
          authorAvatar={post.author.avatar}
          onClose={() => setPortraitModalOpen(false)}
        />
      )}
    </div>
  );
}
