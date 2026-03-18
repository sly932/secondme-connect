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
  taskCategory: string | null; // WRITING | PAINTING | null(=咨询)
  taskType: string; // CONSULT | MARKETPLACE
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
  CONSULT: { label: "咨询", color: "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700", icon: "💬" },
  WRITING: { label: "写作", color: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700", icon: "✍️" },
  PAINTING: { label: "绘画", color: "bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-300 border-pink-200 dark:border-pink-700", icon: "🎨" },
};

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;

const MATCH_COLORS = [
  "from-indigo-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-sky-600",
  "from-violet-500 to-fuchsia-600",
  "from-lime-500 to-green-600",
  "from-red-500 to-rose-700",
  "from-blue-500 to-indigo-600",
  "from-yellow-500 to-amber-600",
];

const TASK_STATUS_LABELS: Record<string, { text: string; color: string }> = {
  MATCHING: { text: "匹配中", color: "text-blue-400" },
  EVALUATING: { text: "评估中", color: "text-blue-400" },
  ACCEPTED: { text: "已接受", color: "text-yellow-500" },
  EXECUTING: { text: "咨询中", color: "text-yellow-500" },
  COMPLETED: { text: "已完成", color: "text-green-500" },
  FAILED: { text: "失败", color: "text-red-400" },
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
      className="rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-zinc-400"
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

  // 评论状态
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [commentedPosts, setCommentedPosts] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [consultingWorker, setConsultingWorker] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // SSE 订阅清理 ref
  const sseCleanupRef = useRef<(() => void) | null>(null);

  // 帖子详情缓存：{ postId → { detail, comments, matchCards, hasMore, fetchedAt } }
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

  // 清理 SSE 订阅
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

  // 自动展开自己的第一个有匹配的帖子
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

    // 写入缓存
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
    // 尝试使用缓存
    if (!skipCache) {
      const cached = detailCacheRef.current.get(postId);
      if (cached) {
        // 无进行中任务 → 缓存有效期 5 分钟
        // 有进行中任务 → 不用缓存，走网络
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
    // 清理旧 SSE 订阅
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

    // 如果有进行中的任务，启动轮询
    startSSEIfNeeded(cards);
  };

  const startSSEIfNeeded = (cards: MatchCard[]) => {
    // 找到所有进行中的任务，为每个建立 SSE 连接
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
          // 任务完成后刷新详情拿最终数据
          detailCacheRef.current.delete(expandedPostId || "");
          if (expandedPostId) fetchPostDetail(expandedPostId, true);
          return;
        }
        try {
          const event = JSON.parse(e.data);
          // 实时更新匹配卡片的 result 和 status
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
    setSubmitting(postId);
    detailCacheRef.current.delete(postId);
    try {
      const res = await fetch(`/api/v1/plaza/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (data.success) {
        setCommentTexts((prev) => ({ ...prev, [postId]: "" }));
        setCommentedPosts((prev) => new Set([...prev, postId]));
        setExpandedComments((prev) => [...prev, data.comment]);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(null);
    }
  };

  const handleManualConsult = async (postId: string, workerId: string) => {
    setConsultingWorker(workerId);
    detailCacheRef.current.delete(postId);
    try {
      const res = await fetch(`/api/v1/plaza/${postId}/consult`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId }),
      });
      const data = await res.json();
      if (data.success) {
        // 刷新详情以更新 matchCard 状态
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

  return (
    <div className="min-h-screen pt-24 pb-16 px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">广场</h1>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索需求..."
            className="w-48 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500"
          />
        </div>

        {/* Posts */}
        {posts.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-400 dark:text-zinc-500">
            还没有帖子，去首页发一个吧
          </div>
        )}

        {posts.map((post) => {
          const isExpanded = expandedPostId === post.id;
          const hasCommented = commentedPosts.has(post.id);
          const isMyPost = session?.user?.id === post.author.id;
          const badgeKey = post.taskCategory || "CONSULT";
          const badge = TASK_TYPE_BADGES[badgeKey] || TASK_TYPE_BADGES.CONSULT;
          const isConsult = !post.taskCategory;

          return (
            <div
              key={post.id}
              className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden"
            >
              {/* Post header + content */}
              <div className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Avatar name={post.author.name} avatar={post.author.avatar} />
                    <span className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                      {post.author.name}
                      {post.author.isNpc && (
                        <span className="ml-1 text-xs text-gray-400 dark:text-zinc-500">AI</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badge.color}`}>
                      {badge.icon} {badge.label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-zinc-500">{timeAgo(post.createdAt, now)}</span>
                  </div>
                </div>
                <p className="text-gray-800 dark:text-zinc-200 text-sm leading-relaxed">{post.content}</p>

                {/* Action pills */}
                <div className="mt-4 flex items-center gap-2">
                  {post.matchCount > 0 && (
                    <button
                      onClick={() => toggleExpand(post.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isExpanded
                          ? "bg-indigo-500 text-white shadow-sm"
                          : "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-70">
                        <path d="M7 1.5C4.5 1.5 2.35 3.05 1.5 5.25C2.35 7.45 4.5 9 7 9C9.5 9 11.65 7.45 12.5 5.25C11.65 3.05 9.5 1.5 7 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="7" cy="5.25" r="1.75" stroke="currentColor" strokeWidth="1.2"/>
                      </svg>
                      {post.matchCount} 个匹配
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        <path d="M2.5 4L5 6.5L7.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  )}
                  {isConsult && (
                    <button
                      onClick={() => toggleExpand(post.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isExpanded && post.matchCount === 0
                          ? "bg-gray-800 dark:bg-zinc-200 text-white dark:text-black shadow-sm"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="opacity-70">
                        <path d="M2 3.5H12M2 7H8M2 10.5H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                      {post.commentCount} 条回复
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded area */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-zinc-800">
                  {/* Loading skeleton */}
                  {detailLoading && (
                    <div className="px-5 py-4">
                      <div className="text-xs font-semibold text-gray-500 dark:text-zinc-400 mb-3 uppercase tracking-wider">
                        匹配的分身
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {Array.from({ length: Math.min(post.matchCount, 4) }).map((_, i) => (
                          <div key={i} className="flex-shrink-0 w-44 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 rounded-2xl p-4 flex flex-col items-center gap-3 animate-pulse">
                            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-zinc-700" />
                            <div className="w-20 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                            <div className="w-16 h-4 rounded-full bg-gray-200 dark:bg-zinc-700" />
                            <div className="w-full h-6 rounded bg-gray-200 dark:bg-zinc-700 mt-auto" />
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
                      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
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

                  {/* Comments — 仅咨询帖子显示 */}
                  {isConsult && expandedComments.length > 0 && (
                    <div className="px-5 py-3 space-y-3">
                      {expandedComments.map((comment) => (
                        <div key={comment.id} className="flex gap-2">
                          <Avatar name={comment.author.name} avatar={comment.author.avatar} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">
                                {comment.author.name}
                                {comment.author.isNpc && (
                                  <span className="ml-1 text-gray-400 dark:text-zinc-500">AI</span>
                                )}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-zinc-600">{timeAgo(comment.createdAt, now)}</span>
                            </div>
                            <p className="text-sm text-gray-700 dark:text-zinc-300 mt-0.5">{comment.content}</p>
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

                  {/* Comment input — 仅咨询帖子显示 */}
                  {isConsult && session && !hasCommented && (
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 flex gap-2">
                      <input
                        type="text"
                        value={commentTexts[post.id] || ""}
                        onChange={(e) =>
                          setCommentTexts((prev) => ({ ...prev, [post.id]: e.target.value }))
                        }
                        placeholder="写一句回复..."
                        className="flex-1 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500"
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
                        className="px-4 py-2 bg-black dark:bg-white text-white dark:text-black text-sm font-medium rounded-lg hover:bg-gray-800 dark:hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {submitting === post.id ? "..." : "发送"}
                      </button>
                    </div>
                  )}

                  {isConsult && session && hasCommented && (
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 text-xs text-gray-400 dark:text-zinc-500 text-center">
                      你已回复过这条帖子
                    </div>
                  )}

                  {isConsult && !session && (
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 text-xs text-gray-400 dark:text-zinc-500 text-center">
                      <button
                        onClick={() => window.location.href = "/api/auth/login"}
                        className="text-gray-600 dark:text-zinc-300 hover:underline"
                      >
                        登录后回复
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Load more */}
        {hasMore && posts.length > 0 && (
          <div className="text-center">
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-6 py-2 text-sm text-gray-500 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {loading ? "加载中..." : "加载更多"}
            </button>
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
  onConsult: (postId: string, workerId: string) => void;
  onViewResult: (result: string) => void;
  isConsulting: boolean;
}) {
  const statusInfo = card.task ? TASK_STATUS_LABELS[card.task.status] : null;
  const isInProgress = card.task && !["COMPLETED", "FAILED", "CANCELLED"].includes(card.task.status);
  const color = MATCH_COLORS[colorIndex % MATCH_COLORS.length];

  return (
    <div className="flex-shrink-0 w-44 bg-gray-50 dark:bg-zinc-800/80 border border-gray-200 dark:border-zinc-700 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md">
      {/* 头像 */}
      <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-base font-bold text-white shadow-lg`}>
        {card.avatar ? (
          <Image
            loader={passthroughImageLoader}
            unoptimized
            src={card.avatar}
            alt={card.name}
            width={48}
            height={48}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          card.name[0]
        )}
      </div>

      {/* 名字 */}
      <span className="text-sm font-semibold text-gray-900 dark:text-white truncate max-w-full">
        {card.name}
      </span>

      {/* 匹配度 */}
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
        {Math.round(card.similarity * 100)}% 匹配
      </span>

      {/* 简介 */}
      {card.bio && (
        <p className="text-[11px] text-gray-500 dark:text-zinc-400 text-center leading-tight line-clamp-2 min-h-[28px]">
          {card.bio}
        </p>
      )}

      {/* 状态/操作区 */}
      <div className="mt-auto w-full">
        {!card.task && (
          <button
            onClick={() => onConsult(postId, card.userId)}
            disabled={isConsulting}
            className="w-full py-1.5 text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            {isConsulting ? "发起中..." : "咨询"}
          </button>
        )}

        {card.task && isInProgress && (
          <button
            onClick={() => card.task?.result && onViewResult(card.task.result)}
            className="w-full py-1.5 flex items-center justify-center gap-1.5 text-xs font-medium text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg transition-colors"
          >
            <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
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
                // 绘画任务：展示 prompt + 图片
                onViewResult(`${card.task.result || ""}\n\n![生成图片](${card.task.resultUrl})`);
              } else if (card.task?.result) {
                onViewResult(card.task.result);
              }
            }}
            className="w-full py-1.5 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
          >
            {card.task?.category === "PAINTING" ? "查看画作" : card.task?.category === "WRITING" ? "查看作品" : "查看回复"}
          </button>
        )}

        {card.task?.status === "FAILED" && (
          <button
            onClick={() => onConsult(postId, card.userId)}
            disabled={isConsulting}
            className="w-full py-1.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50 transition-colors"
          >
            重试
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 咨询结果展示组件 — 支持流式 / 最终结果
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
    <div className={`border rounded-xl p-4 ${
      isStreaming
        ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
        : "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800"
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${
            isStreaming ? "text-blue-500 dark:text-blue-400" : "text-indigo-500 dark:text-indigo-400"
          }`}>
            {isStreaming ? "正在回复中..." : "咨询回复"}
          </span>
          {isStreaming && (
            <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 4L10 10M10 4L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
        {renderResultContent(result)}
        {isStreaming && <span className="inline-block w-1 h-4 ml-0.5 bg-blue-400 animate-pulse align-text-bottom" />}
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
