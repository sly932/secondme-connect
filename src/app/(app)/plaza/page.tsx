"use client";

import { useEffect, useState, useCallback } from "react";
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

interface Post {
  id: string;
  content: string;
  author: Author;
  comments: Comment[];
  createdAt: string;
}

interface PostPreview {
  id: string;
  content: string;
  author: Author;
  commentCount: number;
  createdAt: string;
}

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;

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

function Avatar({ name, avatar }: { name: string; avatar: string | null }) {
  if (avatar) {
    return (
      <Image
        loader={passthroughImageLoader}
        unoptimized
        src={avatar}
        alt={name}
        width={32}
        height={32}
        className="w-8 h-8 rounded-full object-cover"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-zinc-400">
      {name?.[0] || "?"}
    </div>
  );
}

export default function PlazaPage() {
  const { data: session } = useSession();
  const [posts, setPosts] = useState<PostPreview[]>([]);
  const [expandedPost, setExpandedPost] = useState<Post | null>(null);
  const [expandedPostHasMoreComments, setExpandedPostHasMoreComments] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<number | null>(null);

  // 评论状态
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({});
  const [commentedPosts, setCommentedPosts] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState<string | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
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

  const toggleExpand = async (postId: string) => {
    if (expandedPost?.id === postId) {
      setExpandedPost(null);
      return;
    }
    try {
      const res = await fetch(`/api/v1/plaza/${postId}`);
      const data = await res.json();
      if (data.success) {
        setExpandedPost(data.post);
        setExpandedPostHasMoreComments(Boolean(data.hasMoreComments));
        // 检查当前用户是否已评论
        if (session?.user?.id) {
          const hasCommented = data.post.comments.some(
            (c: Comment) => c.author.id === session.user?.id
          );
          if (hasCommented) {
            setCommentedPosts((prev) => new Set([...prev, postId]));
          }
        }
      }
    } catch {
      // ignore
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
        // 刷新展开的帖子
        if (expandedPost?.id === postId) {
          setExpandedPost((prev) =>
            prev ? { ...prev, comments: [...prev.comments, data.comment] } : prev
          );
        }
        // 更新列表中的评论数
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
          const isExpanded = expandedPost?.id === post.id;
          const hasCommented = commentedPosts.has(post.id);

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
                <div className="mt-3 text-xs text-gray-400 dark:text-zinc-500">
                  {post.commentCount} 条回复 {!isExpanded && post.commentCount > 0 && "· 点击展开"}
                </div>
              </button>

              {/* Expanded comments */}
              {isExpanded && expandedPost && (
                <div className="border-t border-gray-100 dark:border-zinc-800">
                  {expandedPost.comments.length > 0 && (
                    <div className="px-5 py-3 space-y-3">
                      {expandedPost.comments.map((comment) => (
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

                  {expandedPostHasMoreComments && (
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
