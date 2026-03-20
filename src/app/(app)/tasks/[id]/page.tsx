"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Image, { type ImageLoaderProps } from "next/image";
import { useT, useLocale } from "@/lib/i18n";

interface TaskDetail {
  id: string;
  type: string;
  category: string | null;
  status: string;
  description: string;
  result: string | null;
  resultUrl: string | null;
  creditCost: number;
  createdAt: string;
  completedAt: string | null;
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

const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "CANCELLED"];

export default function TaskDetailPage() {
  const t = useT();
  const { locale } = useLocale();
  const { status: authStatus } = useSession();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [error, setError] = useState(false);
  const [streamResult, setStreamResult] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch task detail
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }
    if (authStatus !== "authenticated") return;

    fetch(`/api/v1/tasks/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((data) => setTask(data))
      .catch(() => setError(true));
  }, [authStatus, id, router]);

  // SSE for in-progress tasks
  useEffect(() => {
    if (!task || TERMINAL_STATUSES.includes(task.status)) return;

    const es = new EventSource(`/api/v1/tasks/${id}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      if (event.data === "[DONE]") {
        es.close();
        return;
      }
      try {
        const payload = JSON.parse(event.data);
        if (payload.result) {
          setStreamResult((prev) => prev + payload.result);
        }
        if (payload.status) {
          setTask((prev) => prev ? { ...prev, status: payload.status, resultUrl: payload.resultUrl ?? prev.resultUrl } : prev);
        }
        if (TERMINAL_STATUSES.includes(payload.status)) {
          es.close();
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => es.close();

    return () => es.close();
  }, [task?.status, id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authStatus === "loading" || (!task && !error)) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-zinc-950 pt-24 px-6">
        <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
          <div className="w-32 h-4 rounded bg-gray-200 dark:bg-zinc-700" />
          <div className="w-full h-8 rounded bg-gray-200 dark:bg-zinc-700" />
          <div className="w-3/4 h-4 rounded bg-gray-200 dark:bg-zinc-700" />
          <div className="w-full h-40 rounded-xl bg-gray-200 dark:bg-zinc-700" />
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-gray-50/50 dark:bg-zinc-950 pt-24 px-6">
        <div className="max-w-2xl mx-auto text-center py-20">
          <p className="text-gray-400 dark:text-zinc-500 text-lg">{t.tasks.detail.notFound}</p>
          <button onClick={() => router.push("/tasks")} className="mt-4 text-sm text-blue-500 hover:underline">
            {t.tasks.detail.back}
          </button>
        </div>
      </div>
    );
  }

  const statusColors = STATUS_COLORS[task.status] || { color: "text-gray-400", barColor: "bg-gray-400" };
  const statusLabel = t.tasks.status[task.status] || task.status;
  const typeLabel = task.type === "CONSULT" ? t.tasks.consult : task.category === "PAINTING" ? t.tasks.paintingLabel : t.tasks.writingLabel;
  const displayResult = task.result || streamResult;

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-zinc-950 pt-24 px-6 pb-12">
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        {/* Back link */}
        <button
          onClick={() => router.push("/tasks")}
          className="text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors flex items-center gap-1"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t.tasks.detail.back}
        </button>

        {/* Header card */}
        <div className="relative p-6 rounded-xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800 overflow-hidden">
          <div className={`absolute left-0 top-0 bottom-0 w-1 ${statusColors.barColor} rounded-l-xl`} />
          <div className="pl-3 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400 font-medium">
                {typeLabel}
              </span>
              <span className={`text-xs font-medium ${statusColors.color}`}>{statusLabel}</span>
            </div>
            <p className="text-gray-900 dark:text-white text-base leading-relaxed">{task.description}</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Publisher */}
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-2">{t.tasks.detail.publisher}</p>
            <div className="flex items-center gap-2">
              {task.publisher.avatar && (
                <Image loader={passthroughImageLoader} unoptimized src={task.publisher.avatar} alt="" width={24} height={24} className="rounded-full" />
              )}
              <span className="text-sm text-gray-900 dark:text-white">{task.publisher.name}</span>
            </div>
          </div>
          {/* Worker */}
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-2">{t.tasks.detail.worker}</p>
            {task.worker ? (
              <div className="flex items-center gap-2">
                {task.worker.avatar && (
                  <Image loader={passthroughImageLoader} unoptimized src={task.worker.avatar} alt="" width={24} height={24} className="rounded-full" />
                )}
                <span className="text-sm text-gray-900 dark:text-white">{task.worker.name}</span>
              </div>
            ) : (
              <span className="text-sm text-gray-300 dark:text-zinc-600">{t.tasks.detail.noWorker}</span>
            )}
          </div>
          {/* Cost */}
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-2">{t.tasks.detail.cost}</p>
            <span className="text-sm text-gray-900 dark:text-white">{task.creditCost} {t.tasks.detail.credit}</span>
          </div>
          {/* Created */}
          <div className="p-4 rounded-xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-2">{t.tasks.detail.createdAt}</p>
            <span className="text-sm text-gray-900 dark:text-white">
              {new Date(task.createdAt).toLocaleString(locale === "zh" ? "zh-CN" : locale)}
            </span>
          </div>
        </div>

        {/* Result section */}
        {(displayResult || task.resultUrl) && (
          <div className="p-6 rounded-xl bg-white dark:bg-zinc-900/80 border border-gray-200/80 dark:border-zinc-800">
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">{t.tasks.detail.result}</p>
            {task.resultUrl ? (
              <Image
                loader={passthroughImageLoader}
                unoptimized
                src={task.resultUrl}
                alt="result"
                width={640}
                height={400}
                className="w-full rounded-lg object-contain"
              />
            ) : (
              <p className="text-sm text-gray-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">{displayResult}</p>
            )}
          </div>
        )}

        {/* Waiting indicator for in-progress tasks */}
        {!TERMINAL_STATUSES.includes(task.status) && !displayResult && (
          <div className="text-center py-8">
            <div className="inline-block w-6 h-6 border-2 border-gray-200 dark:border-zinc-700 border-t-blue-500 rounded-full animate-spin mb-3" />
            <p className="text-sm text-gray-400 dark:text-zinc-500">{t.tasks.detail.waitingResult}</p>
          </div>
        )}
      </div>
    </div>
  );
}
