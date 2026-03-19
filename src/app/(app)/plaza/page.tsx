"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import Image, { type ImageLoaderProps } from "next/image";

interface Author {
  id: string;
  name: string;
  avatar: string | null;
  isNpc: boolean;
}

interface Comment {
  id: string;
  content: string;
  author: Author;
  createdAt: string;
}

interface MatchCard {
  userId: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  similarity: number;
  task: {
    taskId: string;
    type: string;
    category: string | null;
    status: string;
    result: string | null;
    resultUrl: string | null;
  } | null;
}

interface PostPreview {
  id: string;
  content: string;
  author: Author;
  commentCount: number;
  matchCount: number;
  taskCategory: string | null;
  taskType: string;
  createdAt: string;
}

interface PostDetail {
  id: string;
  content: string;
  author: Author;
  matchedAt: string | null;
  taskCategory: string | null;
  taskType: string;
  createdAt: string;
}

const TASK_TYPE_BADGES: Record<string, { label: string; color: string; icon: string }> = {
  CONSULT: { label: "咨询", color: "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-zinc-700", icon: "💬" },
  WRITING: { label: "写作", color: "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-zinc-700", icon: "✍️" },
  PAINTING: { label: "绘画", color: "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 border-gray-200 dark:border-zinc-700", icon: "🎨" },
};

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;

// 匹配卡片配色：统一灰色基底 + 微妙的色彩区分（仅头像渐变不同）
const MATCH_COLORS = [
  { gradient: "from-gray-700 to-gray-900 dark:from-gray-200 dark:to-gray-400", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
  { gradient: "from-gray-600 to-gray-800 dark:from-gray-300 dark:to-gray-500", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
  { gradient: "from-zinc-600 to-zinc-800 dark:from-zinc-300 dark:to-zinc-400", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
  { gradient: "from-stone-600 to-stone-800 dark:from-stone-300 dark:to-stone-400", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
  { gradient: "from-neutral-600 to-neutral-800 dark:from-neutral-300 dark:to-neutral-400", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
  { gradient: "from-slate-600 to-slate-800 dark:from-slate-300 dark:to-slate-400", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
  { gradient: "from-gray-700 to-gray-900 dark:from-gray-200 dark:to-gray-400", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
  { gradient: "from-gray-600 to-gray-800 dark:from-gray-300 dark:to-gray-500", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
  { gradient: "from-zinc-600 to-zinc-800 dark:from-zinc-300 dark:to-zinc-400", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
  { gradient: "from-stone-600 to-stone-800 dark:from-stone-300 dark:to-stone-400", bg: "from-gray-50 to-gray-100/50 dark:from-zinc-800/60 dark:to-zinc-800/40", accent: "gray" },
];

const TASK_STATUS_LABELS: Record<string, { text: string; color: string }> = {
  MATCHING: { text: "匹配中", color: "text-gray-500 dark:text-zinc-400" },
  EVALUATING: { text: "评估中", color: "text-gray-500 dark:text-zinc-400" },
  ACCEPTED: { text: "已接受", color: "text-gray-600 dark:text-zinc-300" },
  EXECUTING: { text: "咨询中", color: "text-gray-600 dark:text-zinc-300" },
  COMPLETED: { text: "已完成", color: "text-gray-900 dark:text-white" },
  FAILED: { text: "失败", color: "text-red-500 dark:text-red-400" },
};

function timeAgo(date: string, currentTime: number | null) {
  if (!currentTime) return "";
  const diff = currentTime - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function Avatar({ name, avatar, size = 32 }: { name: string; avatar: string | null; size?: number }) {
  if (avatar) {
    return (
      <Image
        loader={passthroughImageLoader}
        unoptimized
        src={avatar}
        alt={name}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-gradient-to-br from-gray-400 to-gray-600 dark:from-zinc-400 dark:to-zinc-600 flex items-center justify-center text-xs font-medium text-white"
      style={{ width: size, height: size }}
    >
      {name?.[0] || "?"}
    </div>
  );
}

export default function PlazaPage() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<PostPreview[]>([]);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail] = useState<PostDetail | null>(null);
  const [expandedComments, setExpandedComments] = useState<Comment[]>([]);
  const [expandedMatchCards, setExpandedMatchCards] = useState<MatchCard[]>([]);
  const [expandedHasMoreComments, setExpandedHasMoreComments] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);

  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [commentedPosts, setCommentedPosts] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [consultingWorker, setConsultingWorker] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const sseCleanupRef = useRef<(() => void) | null>(null);

  const detailCacheRef = useRef<Map<string, {
    detail: PostDetail;
    comments: Comment[];
    matchCards: MatchCard[];
    hasMore: boolean;
    hasInProgress: boolean;
    fetchedAt: number;
  }>>(new Map());

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return () => {
      sseCleanupRef.current?.();
    };
  }, []);

  const fetchPosts = useCallback(async (pageNum: number, searchQuery: string, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: "10" });
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/v1/plaza?${params}`);
      const data = await res.json();
      if (data.success) {
        if (append) {
          setPosts((prev) => [...prev, ...data.posts]);
        } else {
          setPosts(data.posts);
        }
        setHasMore(pageNum < data.pagination.totalPages);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const autoExpandedRef = useRef(false);

  useEffect(() => {
    fetchPosts(1, search);
    setPage(1);
    autoExpandedRef.current = false;
  }, [search, fetchPosts]);

  useEffect(() => {
    if (autoExpandedRef.current || !session?.user?.id || posts.length === 0) return;
    const myPost = posts.find((p) => p.author.id === session.user?.id && p.matchCount > 0);
    if (myPost) {
      autoExpandedRef.current = true;
      toggleExpand(myPost.id);
    }
  }, [posts, session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPosts(next, search, true);
  };

  const applyDetailData = useCallback((postId: string, data: { post: PostDetail; comments: Comment[]; matchCards: MatchCard[]; hasMoreComments: boolean }) => {
    const cards: MatchCard[] = data.matchCards || [];
    const hasInProgress = cards.some(
      (c) => c.task && !["COMPLETED", "FAILED", "CANCELLED"].includes(c.task.status)
    );

    setExpandedDetail(data.post);
    setExpandedComments(data.comments || []);
    setExpandedMatchCards(cards);
    setExpandedHasMoreComments(Boolean(data.hasMoreComments));

    detailCacheRef.current.set(postId, {
      detail: data.post,
      comments: data.comments || [],
      matchCards: cards,
      hasMore: Boolean(data.hasMoreComments),
      hasInProgress,
      fetchedAt: Date.now(),
    });

    if (session?.user?.id) {
      const hasCommented = (data.comments || []).some(
        (c: Comment) => c.author.id === session.user?.id
      );
      if (hasCommented) {
        setCommentedPosts((prev) => new Set([...prev, postId]));
      }
    }

    return cards;
  }, [session?.user?.id]);

  const fetchPostDetail = useCallback(async (postId: string, skipCache = false) => {
    if (!skipCache) {
      const cached = detailCacheRef.current.get(postId);
      if (cached) {
        const cacheAge = Date.now() - cached.fetchedAt;
        if (!cached.hasInProgress && cacheAge < 5 * 60 * 1000) {
          setExpandedDetail(cached.detail);
          setExpandedComments(cached.comments);
          setExpandedMatchCards(cached.matchCards);
          setExpandedHasMoreComments(cached.hasMore);
          return cached.matchCards;
        }
      }
    }

    try {
      const res = await fetch(`/api/v1/plaza/${postId}`);
      const data = await res.json();
      if (data.success) {
        return applyDetailData(postId, data);
      }
    } catch {
      // ignore
    }
    return [];
  }, [applyDetailData]);

  const toggleExpand = async (postId: string) => {
    sseCleanupRef.current?.();
    sseCleanupRef.current = null;

    if (expandedPostId === postId) {
      setExpandedPostId(null);
      setExpandedDetail(null);
      setExpandedMatchCards([]);
      setExpandedResult(null);
      return;
    }

    setExpandedPostId(postId);
    setExpandedResult(null);
    setExpandedDetail(null);
    setExpandedMatchCards([]);
    setExpandedComments([]);
    setDetailLoading(true);
    const cards = await fetchPostDetail(postId);
    setDetailLoading(false);

    startSSEIfNeeded(cards);
  };

  const startSSEIfNeeded = (cards: MatchCard[]) => {
    const inProgressTasks = cards.filter(
      (c) => c.task && !["COMPLETED", "FAILED", "CANCELLED"].includes(c.task.status)
    );

    if (inProgressTasks.length === 0) return;

    const sources: EventSource[] = [];

    for (const card of inProgressTasks) {
      if (!card.task) continue;
      const taskId = card.task.taskId;
      const es = new EventSource(`/api/v1/tasks/${taskId}/stream`);

      es.onmessage = (e) => {
        if (e.data === "[DONE]") {
          es.close();
          detailCacheRef.current.delete(expandedPostId || "");
          if (expandedPostId) fetchPostDetail(expandedPostId, true);
          return;
        }
        try {
          const event = JSON.parse(e.data);
          setExpandedMatchCards((prev) =>
            prev.map((c) =>
              c.task?.taskId === taskId
                ? {
                    ...c,
                    task: {
                      ...c.task!,
                      result: event.result ?? c.task!.result,
                      status: event.status ?? c.task!.status,
                      resultUrl: event.resultUrl ?? c.task!.resultUrl,
                    },
                  }
                : c
            )
          );
        } catch {
          // ignore parse errors
        }
      };

      es.onerror = () => {
        es.close();
      };

      sources.push(es);
    }

    sseCleanupRef.current = () => {
      for (const es of sources) es.close();
    };
  };

  const handleComment = async (postId: string) => {
    const content = commentTexts[postId]?.trim();
    if (!content) return;

    // 乐观更新：立即显示评论
    const tempId = `temp-${Date.now()}`;
    const optimisticComment: Comment = {
      id: tempId,
      content,
      author: {
        id: session?.user?.id || "",
        name: session?.user?.name || "我",
        avatar: (session?.user as { avatar?: string | null })?.avatar ?? null,
        isNpc: false,
      },
      createdAt: new Date().toISOString(),
    };

    setCommentTexts((prev) => ({ ...prev, [postId]: "" }));
    setCommentedPosts((prev) => new Set([...prev, postId]));
    setExpandedComments((prev) => [...prev, optimisticComment]);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p
      )
    );
    detailCacheRef.current.delete(postId);

    // 异步保存到服务器
    try {
      const res = await fetch(`/api/v1/plaza/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        // 用服务器返回的真实评论替换临时评论
        setExpandedComments((prev) =>
          prev.map((c) => (c.id === tempId ? data.comment : c))
        );
      } else {
        // 回滚
        setExpandedComments((prev) => prev.filter((c) => c.id !== tempId));
        setCommentedPosts((prev) => { const next = new Set(prev); next.delete(postId); return next; });
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, commentCount: p.commentCount - 1 } : p
          )
        );
        setCommentTexts((prev) => ({ ...prev, [postId]: content }));
      }
    } catch {
      // 网络错误回滚
      setExpandedComments((prev) => prev.filter((c) => c.id !== tempId));
      setCommentedPosts((prev) => { const next = new Set(prev); next.delete(postId); return next; });
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, commentCount: p.commentCount - 1 } : p
        )
      );
      setCommentTexts((prev) => ({ ...prev, [postId]: content }));
    }
  };

  const handleManualConsult = async (postId: string, workerId: string, category?: string) => {
    setConsultingWorker(workerId);
    detailCacheRef.current.delete(postId);
    try {
      const res = await fetch(`/api/v1/plaza/${postId}/consult`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, ...(category && { category }) }),
      });
      const data = await res.json();
      if (data.success) {
        const cards = await fetchPostDetail(postId, true);
        sseCleanupRef.current?.();
        startSSEIfNeeded(cards);
      }
    } catch {
      // ignore
    } finally {
      setConsultingWorker(null);
    }
  };

  // Infinite scroll
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && posts.length > 0) {
          loadMore();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loading, posts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen pt-24 pb-16 px-6 bg-gray-50/50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex-shrink-0">广场</h1>
          <div className="relative flex-1 max-w-xs">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            {loading && search && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 dark:border-zinc-600 border-t-transparent rounded-full animate-spin" />
            )}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索需求..."
              className="w-full bg-white dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-700 rounded-xl pl-9 pr-9 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 input-focus focus:outline-none transition-all"
            />
          </div>
        </div>

        {/* 首次加载骨架屏 */}
        {posts.length === 0 && loading && (
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-gray-200 dark:bg-zinc-700" />
                  <div className="space-y-1.5 flex-1">
                    <div className="w-20 h-4 rounded bg-gray-200 dark:bg-zinc-700" />
                    <div className="w-12 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="w-full h-4 rounded bg-gray-200 dark:bg-zinc-700" />
                  <div className="w-2/3 h-4 rounded bg-gray-200 dark:bg-zinc-700" />
                </div>
                <div className="flex gap-3 pt-1">
                  <div className="w-24 h-7 rounded-full bg-gray-200 dark:bg-zinc-700" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {posts.length === 0 && !loading && (
          <div className="text-center py-16 animate-fade-in">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-gray-300 dark:text-zinc-700 mb-4">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-gray-400 dark:text-zinc-500">{search ? "没有找到匹配的帖子" : "还没有帖子，去首页发一个吧"}</p>
          </div>
        )}

        {/* Posts */}
        {posts.map((post, postIndex) => {
          const isExpanded = expandedPostId === post.id;
          const hasCommented = commentedPosts.has(post.id);
          const isMyPost = session?.user?.id === post.author.id;
          const badgeKey = post.taskCategory || "CONSULT";
          const badge = TASK_TYPE_BADGES[badgeKey] || TASK_TYPE_BADGES.CONSULT;
          const isConsult = !post.taskCategory;
          const hasDetails = post.matchCount > 0 || (isConsult && post.commentCount > 0);

          return (
            <div
              key={post.id}
              className={`relative bg-white dark:bg-zinc-900/80 border rounded-xl overflow-hidden card-hover animate-fade-in-up ${
                isMyPost
                  ? "border-gray-300/80 dark:border-zinc-700"
                  : "border-gray-200/80 dark:border-zinc-800"
              }`}
              style={{ animationDelay: `${postIndex * 0.04}s` }}
            >
              {/* 自己帖子的左侧色条 */}
              {isMyPost && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-gray-400 to-gray-600 dark:from-zinc-400 dark:to-zinc-500 rounded-l-xl" />
              )}

              {/* Post header + content */}
              <div className={`p-5 ${isMyPost ? "pl-6" : ""}`}>
                <div className="flex items-center gap-2.5 mb-3">
                  <Avatar name={post.author.name} avatar={post.author.avatar} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {post.author.name}
                      </span>
                      {post.author.isNpc && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 rounded">AI</span>
                      )}
                      {isMyPost && (
                        <span className="px-1.5 py-0.5 text-[10px] font-medium bg-gray-200 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300 rounded">我的</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 dark:text-zinc-500">{timeAgo(post.createdAt, now)}</span>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${badge.color}`}>
                    {badge.icon} {badge.label}
                  </span>
                </div>

                <p className="text-gray-800 dark:text-zinc-200 text-sm leading-relaxed">{post.content}</p>

                {/* Action bar */}
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => toggleExpand(post.id)}
                    className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                      isExpanded
                        ? "bg-gray-900 dark:bg-white text-white dark:text-black shadow-sm"
                        : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {post.matchCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="opacity-70">
                          <path d="M7 1.5C4.5 1.5 2.35 3.05 1.5 5.25C2.35 7.45 4.5 9 7 9C9.5 9 11.65 7.45 12.5 5.25C11.65 3.05 9.5 1.5 7 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="7" cy="5.25" r="1.75" stroke="currentColor" strokeWidth="1.2"/>
                        </svg>
                        {post.matchCount}
                      </span>
                    )}
                    {post.matchCount > 0 && isConsult && <span className="text-gray-300 dark:text-zinc-600">·</span>}
                    {isConsult && (
                      <span className="inline-flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                        </svg>
                        {post.commentCount}
                      </span>
                    )}
                    {!hasDetails && "展开"}
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>
                      <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded area with transition */}
              <div className={`grid transition-all duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-zinc-800">
                      {/* Loading skeleton */}
                      {detailLoading && (
                        <div className="px-5 py-4">
                          <div className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-3 uppercase tracking-wider">
                            匹配的分身
                          </div>
                          <div className="flex gap-3 overflow-x-auto pb-2">
                            {Array.from({ length: Math.min(post.matchCount || 1, 4) }).map((_, i) => (
                              <div key={i} className="flex-shrink-0 w-52 rounded-2xl overflow-hidden animate-pulse">
                                <div className="bg-gray-100 dark:bg-zinc-800/80 px-4 pt-5 pb-8 flex flex-col items-center gap-3">
                                  <div className="w-[72px] h-[72px] rounded-full bg-gray-200 dark:bg-zinc-700" />
                                  <div className="w-24 h-3.5 rounded bg-gray-200 dark:bg-zinc-700" />
                                  <div className="w-32 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                                </div>
                                <div className="bg-white dark:bg-zinc-900/90 px-4 py-3">
                                  <div className="w-full h-8 rounded-lg bg-gray-200 dark:bg-zinc-700" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Match Cards */}
                      {!detailLoading && expandedMatchCards.length > 0 && isMyPost && (
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
                          <div className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-3 uppercase tracking-wider">
                            匹配的分身
                          </div>
                          <div className="relative">
                            <div className="absolute left-0 top-0 bottom-2 w-6 bg-gradient-to-r from-white dark:from-zinc-900/80 to-transparent z-10 pointer-events-none" />
                            <div className="absolute right-0 top-0 bottom-2 w-6 bg-gradient-to-l from-white dark:from-zinc-900/80 to-transparent z-10 pointer-events-none" />
                            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
                              {expandedMatchCards.map((card, idx) => (
                                <MatchCardComponent
                                  key={card.userId}
                                  card={card}
                                  colorIndex={idx}
                                  postId={post.id}
                                  onConsult={handleManualConsult}
                                  onViewResult={(result) => setExpandedResult(result)}
                                  isConsulting={consultingWorker === card.userId}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Expanded result */}
                      {expandedResult && (
                        <div className="px-5 py-4 border-b border-gray-100 dark:border-zinc-800">
                          <ExpandedResultView
                            result={expandedResult}
                            isStreaming={expandedMatchCards.some(
                              (c) => c.task?.result === expandedResult && c.task?.status !== "COMPLETED" && c.task?.status !== "FAILED"
                            )}
                            onClose={() => setExpandedResult(null)}
                          />
                        </div>
                      )}

                      {/* Comments */}
                      {isConsult && expandedComments.length > 0 && (
                        <div className="px-5 py-3">
                          {expandedComments.map((comment, ci) => (
                            <div key={comment.id}>
                              {ci > 0 && <div className="border-t border-gray-50 dark:border-zinc-800/60 my-2.5" />}
                              <div className="flex gap-2.5">
                                <Avatar name={comment.author.name} avatar={comment.author.avatar} size={28} />
                                <div className="flex-1 min-w-0">
                                  <div className="bg-gray-50 dark:bg-zinc-800/60 rounded-xl px-3 py-2">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-xs font-semibold text-gray-700 dark:text-zinc-300">
                                        {comment.author.name}
                                      </span>
                                      {comment.author.isNpc && (
                                        <span className="px-1 py-0.5 text-[9px] font-medium bg-gray-200 dark:bg-zinc-700 text-gray-500 dark:text-zinc-400 rounded">AI</span>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-700 dark:text-zinc-300">{comment.content}</p>
                                  </div>
                                  <span className="text-[11px] text-gray-400 dark:text-zinc-600 mt-1 ml-1 block">{timeAgo(comment.createdAt, now)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {isConsult && expandedHasMoreComments && (
                        <div className="px-5 pb-3 text-xs text-gray-400 dark:text-zinc-500">
                          仅展示最近 50 条评论。
                        </div>
                      )}

                      {/* Comment input */}
                      {isConsult && session && !hasCommented && (
                        <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800">
                          <div className="flex gap-2.5 items-end">
                            <input
                              type="text"
                              value={commentTexts[post.id] || ""}
                              onChange={(e) =>
                                setCommentTexts((prev) => ({ ...prev, [post.id]: e.target.value }))
                              }
                              placeholder="写一句回复..."
                              className="flex-1 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 input-focus focus:outline-none transition-all"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  handleComment(post.id);
                                }
                              }}
                            />
                            <button
                              onClick={() => handleComment(post.id)}
                              disabled={submitting === post.id || !commentTexts[post.id]?.trim()}
                              className="p-2.5 bg-gray-900 dark:bg-white text-white dark:text-black rounded-xl hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="22" y1="2" x2="11" y2="13" />
                                <polygon points="22 2 15 22 11 13 2 9 22 2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}

                      {isConsult && session && hasCommented && (
                        <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 flex items-center justify-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 dark:text-zinc-500">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          你已回复过这条帖子
                        </div>
                      )}

                      {isConsult && !session && (
                        <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 text-xs text-center">
                          <button
                            onClick={() => window.location.href = "/api/auth/login"}
                            className="text-gray-600 dark:text-zinc-300 hover:underline font-medium"
                          >
                            登录后回复
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />

        {/* Loading indicator for more */}
        {loading && posts.length > 0 && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-gray-400 dark:text-zinc-500">
            <div className="w-4 h-4 border-2 border-gray-300 dark:border-zinc-600 border-t-transparent rounded-full animate-spin" />
            加载中...
          </div>
        )}

        {/* End of list */}
        {!hasMore && posts.length > 0 && (
          <div className="text-center py-4 text-xs text-gray-300 dark:text-zinc-700">
            — 没有更多了 —
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 匹配卡片组件
// ============================================================
function MatchCardComponent({
  card,
  colorIndex,
  postId,
  onConsult,
  onViewResult,
  isConsulting,
}: {
  card: MatchCard;
  colorIndex: number;
  postId: string;
  onConsult: (postId: string, workerId: string, category?: string) => void;
  onViewResult: (result: string) => void;
  isConsulting: boolean;
}) {
  const statusInfo = card.task ? TASK_STATUS_LABELS[card.task.status] : null;
  const isInProgress = card.task && !["COMPLETED", "FAILED", "CANCELLED"].includes(card.task.status);
  const palette = MATCH_COLORS[colorIndex % MATCH_COLORS.length];
  const matchPct = Math.round(card.similarity * 100);

  // SVG ring progress (circumference = 2 * PI * 30 ≈ 188.5)
  const circumference = 188.5;
  const strokeDashoffset = circumference - (circumference * matchPct) / 100;

  return (
    <div
      className={`flex-shrink-0 w-52 rounded-2xl overflow-hidden flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-white/60 dark:border-zinc-700/60`}
    >
      {/* 顶部渐变背景区 */}
      <div className={`relative bg-gradient-to-br ${palette.bg} px-4 pt-5 pb-8 flex flex-col items-center`}>
        {/* 顶部渐变色条 */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${palette.gradient}`} />

        {/* 头像 + 匹配度圆环 */}
        <div className="relative w-[72px] h-[72px] mb-3">
          {/* SVG 圆环 */}
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r="30" fill="none" stroke="currentColor" strokeWidth="3" className="text-gray-200 dark:text-zinc-700" />
            <circle
              cx="36" cy="36" r="30" fill="none" strokeWidth="3"
              strokeLinecap="round"
              className="text-gray-900 dark:text-white"
              stroke="currentColor"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              style={{ transition: "stroke-dashoffset 0.8s ease" }}
            />
          </svg>
          {/* 头像 */}
          <div className={`absolute inset-[4px] rounded-full bg-gradient-to-br ${palette.gradient} flex items-center justify-center text-lg font-bold text-white shadow-lg ring-2 ring-white dark:ring-zinc-900`}>
            {card.avatar ? (
              <Image
                loader={passthroughImageLoader}
                unoptimized
                src={card.avatar}
                alt={card.name}
                width={64}
                height={64}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              card.name[0]
            )}
          </div>
          {/* 匹配度数字 */}
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-white dark:bg-zinc-900 rounded-full px-2 py-0.5 shadow-sm border border-gray-100 dark:border-zinc-700">
            <span className="text-[10px] font-bold text-gray-900 dark:text-white">{matchPct}%</span>
          </div>
        </div>

        {/* 名字 */}
        <span className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-full">
          {card.name}
        </span>

        {/* 简介 */}
        {card.bio && (
          <p className="text-[11px] text-gray-500 dark:text-zinc-400 text-center leading-tight line-clamp-2 mt-1.5 min-h-[28px]">
            {card.bio}
          </p>
        )}
      </div>

      {/* 底部操作区 */}
      <div className="bg-white dark:bg-zinc-900/90 px-4 py-3 mt-auto">
        {!card.task && (
          <button
            onClick={() => onConsult(postId, card.userId)}
            disabled={isConsulting}
            className="w-full py-2 text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg disabled:opacity-50 transition-all duration-200 hover:bg-gray-800 dark:hover:bg-zinc-200 hover:shadow-md active:scale-[0.97]"
          >
            {isConsulting ? "发起中..." : "发起咨询"}
          </button>
        )}

        {card.task && isInProgress && (
          <button
            onClick={() => card.task?.result && onViewResult(card.task.result)}
            className="w-full py-2 flex items-center justify-center gap-1.5 text-xs font-medium bg-gray-50 dark:bg-zinc-800 text-gray-600 dark:text-zinc-300 rounded-lg transition-all duration-200 hover:bg-gray-100 dark:hover:bg-zinc-700"
          >
            <div className="w-3 h-3 border-2 border-gray-400 dark:border-zinc-500 border-t-transparent rounded-full animate-spin" />
            <span className={statusInfo?.color || "text-gray-400"}>
              {statusInfo?.text || card.task.status}
            </span>
            {card.task?.result && (
              <span className="text-gray-400 dark:text-zinc-500 ml-0.5">· 查看</span>
            )}
          </button>
        )}

        {card.task?.status === "COMPLETED" && (
          <button
            onClick={() => {
              if (card.task?.resultUrl) {
                onViewResult(`${card.task.result || ""}\n\n![生成图片](${card.task.resultUrl})`);
              } else if (card.task?.result) {
                onViewResult(card.task.result);
              }
            }}
            className="w-full py-2 text-xs font-semibold bg-gray-900 dark:bg-white text-white dark:text-black rounded-lg transition-all duration-200 hover:bg-gray-800 dark:hover:bg-zinc-200 hover:shadow-md active:scale-[0.97]"
          >
            {card.task?.category === "PAINTING" ? "查看画作" : card.task?.category === "WRITING" ? "查看作品" : "查看回复"}
          </button>
        )}

        {card.task?.status === "FAILED" && (
          <button
            onClick={() => onConsult(postId, card.userId, card.task?.category || undefined)}
            disabled={isConsulting}
            className="w-full py-2 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50 transition-all duration-200 hover:shadow-md active:scale-[0.97]"
          >
            重试
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 咨询结果展示组件
// ============================================================
function ExpandedResultView({
  result,
  isStreaming,
  onClose,
}: {
  result: string;
  isStreaming: boolean;
  onClose: () => void;
}) {
  return (
    <div className="border rounded-xl p-4 bg-gray-50 dark:bg-zinc-800/60 border-gray-200 dark:border-zinc-700">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-600 dark:text-zinc-300">
            {isStreaming ? "正在回复中..." : "咨询回复"}
          </span>
          {isStreaming && (
            <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-zinc-500 animate-pulse" />
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {renderResultContent(result)}
        {isStreaming && <span className="inline-block w-1 h-4 ml-0.5 bg-gray-400 dark:bg-zinc-500 animate-pulse align-text-bottom" />}
      </div>
    </div>
  );
}

/** 渲染结果内容 — 支持 markdown 图片 ![alt](url) */
function renderResultContent(text: string) {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const parts: (string | { alt: string; url: string })[] = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push({ alt: match[1], url: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  if (parts.length === 1 && typeof parts[0] === "string") {
    return <>{text}</>;
  }

  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <span key={i}>{part}</span>
        ) : (
          <Image
            key={i}
            loader={passthroughImageLoader}
            unoptimized
            src={part.url}
            alt={part.alt}
            width={512}
            height={384}
            className="mt-3 rounded-lg w-full max-w-md"
          />
        )
      )}
    </>
  );
}
