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
    status: string;
    result: string | null;
  } | null;
}

interface PostPreview {
  id: string;
  content: string;
  author: Author;
  commentCount: number;
  matchCount: number;
  createdAt: string;
}

interface PostDetail {
  id: string;
  content: string;
  author: Author;
  matchedAt: string | null;
  createdAt: string;
}

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

  // 轮询 ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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

  useEffect(() => {
    fetchPosts(1, search);
    setPage(1);
  }, [search, fetchPosts]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPosts(next, search, true);
  };

  const fetchPostDetail = useCallback(async (postId: string) => {
    try {
      const res = await fetch(`/api/v1/plaza/${postId}`);
      const data = await res.json();
      if (data.success) {
        setExpandedDetail(data.post);
        setExpandedComments(data.comments || []);
        setExpandedMatchCards(data.matchCards || []);
        setExpandedHasMoreComments(Boolean(data.hasMoreComments));

        if (session?.user?.id) {
          const hasCommented = (data.comments || []).some(
            (c: Comment) => c.author.id === session.user?.id
          );
          if (hasCommented) {
            setCommentedPosts((prev) => new Set([...prev, postId]));
          }
        }

        return data.matchCards || [];
      }
    } catch {
      // ignore
    }
    return [];
  }, [session?.user?.id]);

  const toggleExpand = async (postId: string) => {
    // 清理旧轮询
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (expandedPostId === postId) {
      setExpandedPostId(null);
      setExpandedDetail(null);
      setExpandedMatchCards([]);
      setExpandedResult(null);
      return;
    }

    setExpandedPostId(postId);
    setExpandedResult(null);
    const cards = await fetchPostDetail(postId);

    // 如果有进行中的任务，启动轮询
    startPollingIfNeeded(postId, cards);
  };

  const startPollingIfNeeded = (postId: string, cards: MatchCard[]) => {
    const hasInProgress = cards.some(
      (c: MatchCard) => c.task && !["COMPLETED", "FAILED", "CANCELLED"].includes(c.task.status)
    );
    if (hasInProgress) {
      pollRef.current = setInterval(async () => {
        const updated = await fetchPostDetail(postId);
        const stillInProgress = updated.some(
          (c: MatchCard) => c.task && !["COMPLETED", "FAILED", "CANCELLED"].includes(c.task.status)
        );
        if (!stillInProgress && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }, 3000);
    }
  };

  const handleComment = async (postId: string) => {
    const content = commentTexts[postId]?.trim();
    if (!content) return;
    setSubmitting(postId);
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
    try {
      const res = await fetch(`/api/v1/plaza/${postId}/consult`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId }),
      });
      const data = await res.json();
      if (data.success) {
        // 刷新详情以更新 matchCard 状态
        const cards = await fetchPostDetail(postId);
        startPollingIfNeeded(postId, cards);
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

          return (
            <div
              key={post.id}
              className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden"
            >
              {/* Post header + content */}
              <button
                onClick={() => toggleExpand(post.id)}
                className="w-full text-left p-5 hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
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
                  <span className="text-xs text-gray-400 dark:text-zinc-500">{timeAgo(post.createdAt, now)}</span>
                </div>
                <p className="text-gray-800 dark:text-zinc-200 text-sm leading-relaxed">{post.content}</p>
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-400 dark:text-zinc-500">
                  <span>{post.commentCount} 条回复</span>
                  {post.matchCount > 0 && (
                    <span className="text-indigo-400">{post.matchCount} 个匹配</span>
                  )}
                  {!isExpanded && (post.commentCount > 0 || post.matchCount > 0) && (
                    <span>· 点击展开</span>
                  )}
                </div>
              </button>

              {/* Expanded area */}
              {isExpanded && (
                <div className="border-t border-gray-100 dark:border-zinc-800">
                  {/* Match Cards */}
                  {expandedMatchCards.length > 0 && isMyPost && (
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
                      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4">
                        <div className="text-xs font-semibold text-indigo-500 dark:text-indigo-400 mb-2">咨询回复</div>
                        <p className="text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{expandedResult}</p>
                      </div>
                    </div>
                  )}

                  {/* Comments */}
                  {expandedComments.length > 0 && (
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

                  {expandedHasMoreComments && (
                    <div className="px-5 pb-3 text-xs text-gray-400 dark:text-zinc-500">
                      仅展示最近 50 条评论。
                    </div>
                  )}

                  {/* Comment input */}
                  {session && !hasCommented && (
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

                  {session && hasCommented && (
                    <div className="px-5 py-3 border-t border-gray-100 dark:border-zinc-800 text-xs text-gray-400 dark:text-zinc-500 text-center">
                      你已回复过这条帖子
                    </div>
                  )}

                  {!session && (
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
          <div className="flex items-center justify-center gap-1.5 py-1.5">
            <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            <span className={`text-xs font-medium ${statusInfo?.color || "text-gray-400"}`}>
              {statusInfo?.text || card.task.status}
            </span>
          </div>
        )}

        {card.task?.status === "COMPLETED" && (
          <button
            onClick={() => card.task?.result && onViewResult(card.task.result)}
            className="w-full py-1.5 text-xs font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
          >
            查看回复
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
