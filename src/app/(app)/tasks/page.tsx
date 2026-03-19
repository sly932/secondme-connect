"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image, { type ImageLoaderProps } from "next/image";
import { useT, useLocale } from "@/lib/i18n";

interface TaskItem {
  id: string;
  type: string;
  category: string | null;
  status: string;
  description: string;
  result: string | null;
  resultUrl: string | null;
  creditCost: number;
  createdAt: string;
  publisher: { id: string; name: string; avatar: string | null };
  worker: { id: string; name: string; avatar: string | null } | null;
}

const passthroughImageLoader = ({ src }: ImageLoaderProps) => src;

const STATUS_COLORS: Record<string, { color: string; barColor: string }> = {
  MATCHING: { color: "text-yellow-500 dark:text-yellow-400", barColor: "bg-yellow-400" },
  PENDING: { color: "text-yellow-500 dark:text-yellow-400", barColor: "bg-yellow-400" },
  EVALUATING: { color: "text-blue-500 dark:text-blue-400", barColor: "bg-blue-400" },
  ACCEPTED: { color: "text-blue-500 dark:text-blue-400", barColor: "bg-blue-400" },
  EXECUTING: { color: "text-indigo-500 dark:text-indigo-400", barColor: "bg-indigo-400" },
  COMPLETED: { color: "text-emerald-500 dark:text-emerald-400", barColor: "bg-emerald-400" },
  FAILED: { color: "text-red-500 dark:text-red-400", barColor: "bg-red-400" },
  CANCELLED: { color: "text-gray-400 dark:text-zinc-400", barColor: "bg-gray-400" },
};

export default function TasksPage() {
  const t = useT();
  const { locale } = useLocale();
  const { status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<"published" | "received">("published");
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      fetch(`/api/v1/tasks?tab=${tab}`)
        .then((r) => r.json())
        .then((data) => setTasks(data.tasks || []));
    }
  }, [status, tab, router]);

  const loading = status === "loading" || tasks === null;

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-zinc-950 pt-24 px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t.tasks.title}</h1>

        {/* Tab 切换 */}
        <div className="flex gap-1 bg-gray-100 dark:bg-zinc-900 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("published")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              tab === "published" ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            {t.tasks.published}
          </button>
          <button
            onClick={() => setTab("received")}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
              tab === "received" ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            {t.tasks.received}
          </button>
        </div>

        {/* Task List */}
        {loading ? (
          <div className="space-y-3 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="relative p-5 rounded-xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800 overflow-hidden">
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-200 dark:bg-zinc-700 rounded-l-xl" />
                <div className="pl-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-5 rounded-md bg-gray-200 dark:bg-zinc-700" />
                    <div className="w-10 h-4 rounded bg-gray-200 dark:bg-zinc-700" />
                  </div>
                  <div className="w-3/4 h-4 rounded bg-gray-200 dark:bg-zinc-700" />
                  <div className="flex gap-4">
                    <div className="w-16 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                    <div className="w-24 h-3 rounded bg-gray-200 dark:bg-zinc-700" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-gray-300 dark:text-zinc-700 mb-4">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <p className="text-gray-400 dark:text-zinc-500">{t.tasks.noTasks}</p>
            <p className="text-sm text-gray-300 dark:text-zinc-600 mt-1">{t.tasks.noTasksHint}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task, i) => {
              const statusColors = STATUS_COLORS[task.status] || { color: "text-gray-400 dark:text-zinc-400", barColor: "bg-gray-400" };
              const statusLabel = t.tasks.status[task.status] || task.status;
              return (
                <div
                  key={task.id}
                  className="relative p-5 rounded-xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800 hover:border-gray-300 dark:hover:border-zinc-700 transition-all duration-200 cursor-pointer card-hover overflow-hidden animate-fade-in-up"
                  style={{ animationDelay: `${i * 0.05}s` }}
                  onClick={() => router.push(`/tasks/${task.id}`)}
                >
                  {/* 左侧状态色条 */}
                  <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColors.barColor} rounded-l-xl`} />

                  <div className="flex items-start justify-between pl-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 font-medium">
                          {task.type === "CONSULT" ? t.tasks.consult : task.category === "PAINTING" ? t.tasks.paintingLabel : t.tasks.writingLabel}
                        </span>
                        <span className={`text-xs font-medium ${statusColors.color}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="text-gray-900 dark:text-white text-sm truncate">{task.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-zinc-500">
                        <span>{task.creditCost} credit</span>
                        <span>{new Date(task.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : locale)}</span>
                        {task.worker && <span>{t.tasks.worker} {task.worker.name}</span>}
                      </div>
                    </div>
                  </div>

                  {task.result && task.status === "COMPLETED" && (
                    <div className="mt-3 ml-3 p-3 bg-gray-50 dark:bg-zinc-800/80 rounded-lg text-sm text-gray-700 dark:text-zinc-300 max-h-24 overflow-hidden">
                      {task.resultUrl ? (
                        <Image
                          loader={passthroughImageLoader}
                          unoptimized
                          src={task.resultUrl}
                          alt="result"
                          width={320}
                          height={160}
                          className="h-20 w-auto rounded object-cover"
                        />
                      ) : (
                        <p className="line-clamp-3">{task.result}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
