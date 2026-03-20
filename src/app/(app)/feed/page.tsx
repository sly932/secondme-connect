"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { FeedItem, type FeedPost } from "@/components/FeedItem";
import { useT } from "@/lib/i18n";

type FeedTab = "all" | "mine";

export default function FeedPage() {
  const t = useT();
  const { data: session } = useSession();
  const searchParams = useSearchParams();
  const expandPostId = searchParams.get("expand");

  const [tab, setTab] = useState<FeedTab>("all");
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [now, setNow] = useState<number | null>(null);

  // Cache: store posts per tab so switching doesn't re-fetch
  const cacheRef = useRef<Record<FeedTab, { posts: FeedPost[]; page: number; hasMore: boolean } | null>>({
    all: null,
    mine: null,
  });

  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const fetchPosts = useCallback(async (pageNum: number, searchQuery: string, currentTab: FeedTab, append = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: "10" });
      if (searchQuery) params.set("search", searchQuery);
      if (currentTab === "mine" && session?.user?.id) {
        params.set("authorId", session.user.id);
      }
      const res = await fetch(`/api/v1/plaza?${params}`);
      const data = await res.json();
      if (data.success) {
        const newPosts = append ? [...(cacheRef.current[currentTab]?.posts || []), ...data.posts] : data.posts;
        const newHasMore = pageNum < data.pagination.totalPages;
        setPosts(newPosts);
        setHasMore(newHasMore);
        cacheRef.current[currentTab] = { posts: newPosts, page: pageNum, hasMore: newHasMore };
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [session?.user?.id]);

  // Initial load & tab switch
  useEffect(() => {
    const cached = cacheRef.current[tab];
    if (cached && !search) {
      setPosts(cached.posts);
      setPage(cached.page);
      setHasMore(cached.hasMore);
      setLoading(false);
      return;
    }
    setPage(1);
    fetchPosts(1, search, tab);
  }, [tab, search, fetchPosts]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchPosts(next, search, tab, true);
  };

  // Infinite scroll sentinel
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

  const handleTabSwitch = (newTab: FeedTab) => {
    if (newTab === tab) return;
    setTab(newTab);
  };

  return (
    <div className="min-h-screen pt-24 pb-16 px-4 sm:px-6 bg-gray-50/50 dark:bg-zinc-950">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header: title + tabs + search */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t.feed.title}</h1>
            <div className="flex bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
              {(["all", "mine"] as FeedTab[]).map((key) => (
                <button
                  key={key}
                  onClick={() => handleTabSwitch(key)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                    tab === key
                      ? "bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-300"
                  }`}
                >
                  {key === "all" ? t.feed.all : t.feed.mine}
                </button>
              ))}
            </div>
          </div>
          <div className="relative max-w-[180px]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); cacheRef.current = { all: null, mine: null }; }}
              placeholder={t.feed.searchPlaceholder}
              className="w-full bg-white dark:bg-zinc-900/80 border border-gray-200 dark:border-zinc-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none input-focus transition-all"
            />
          </div>
        </div>

        {/* Loading skeleton */}
        {posts.length === 0 && loading && (
          <div className="space-y-6 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-0">
                <div className="w-10 flex flex-col items-center">
                  <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-zinc-700" />
                  <div className="w-px h-12 bg-gray-200 dark:bg-zinc-700 mt-1" />
                </div>
                <div className="w-4 h-px bg-gray-200 dark:bg-zinc-700 mt-4" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="w-24 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                  <div className="w-full h-4 rounded bg-gray-200 dark:bg-zinc-700" />
                  <div className="w-3/4 h-4 rounded bg-gray-200 dark:bg-zinc-700" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {posts.length === 0 && !loading && (
          <div className="text-center py-16 text-gray-400 dark:text-zinc-500 text-sm">
            {t.feed.empty}
          </div>
        )}

        {/* Feed list */}
        <div className="space-y-4">
          {posts.map((post) => (
            <FeedItem key={post.id} post={post} now={now} defaultExpanded={post.id === expandPostId} />
          ))}
        </div>

        {/* Infinite scroll sentinel */}
        <div ref={sentinelRef} className="h-1" />

        {/* Loading more */}
        {loading && posts.length > 0 && (
          <div className="flex justify-center py-4">
            <div className="w-5 h-5 border-2 border-gray-300 dark:border-zinc-600 border-t-gray-900 dark:border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* No more */}
        {!hasMore && posts.length > 0 && (
          <div className="text-center py-4 text-xs text-gray-400 dark:text-zinc-500">
            {t.feed.noMore}
          </div>
        )}
      </div>
    </div>
  );
}
