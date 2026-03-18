"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  MATCHING: { label: "匹配中", color: "text-yellow-500 dark:text-yellow-400" },
  PENDING: { label: "待确认", color: "text-yellow-500 dark:text-yellow-400" },
  EVALUATING: { label: "评估中", color: "text-blue-500 dark:text-blue-400" },
  ACCEPTED: { label: "已接单", color: "text-blue-500 dark:text-blue-400" },
  EXECUTING: { label: "执行中", color: "text-indigo-500 dark:text-indigo-400" },
  COMPLETED: { label: "已完成", color: "text-emerald-500 dark:text-emerald-400" },
  FAILED: { label: "失败", color: "text-red-500 dark:text-red-400" },
  CANCELLED: { label: "已取消", color: "text-gray-400 dark:text-zinc-400" },
};

export default function TasksPage() {
  const { status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<"published" | "received">("published");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      setLoading(true);
      fetch(`/api/v1/tasks?tab=${tab}`)
        .then((r) => r.json())
        .then((data) => setTasks(data.tasks || []))
        .finally(() => setLoading(false));
    }
  }, [status, tab, router]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-black pt-24 px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">我的任务</h1>

        {/* Tab 切换 */}
        <div className="flex gap-1 bg-gray-100 dark:bg-zinc-900 rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab("published")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === "published" ? "bg-white dark:bg-white text-black shadow-sm" : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            我发布的
          </button>
          <button
            onClick={() => setTab("received")}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
              tab === "received" ? "bg-white dark:bg-white text-black shadow-sm" : "text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            分身接的
          </button>
        </div>

        {/* Task List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-gray-900 dark:border-white border-t-transparent rounded-full" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-zinc-500">暂无任务</div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => {
              const statusInfo = STATUS_LABELS[task.status] || { label: task.status, color: "text-gray-400 dark:text-zinc-400" };
              return (
                <div
                  key={task.id}
                  className="p-5 rounded-xl bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 hover:border-gray-400 dark:hover:border-zinc-700 transition-colors cursor-pointer"
                  onClick={() => router.push(`/tasks/${task.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-zinc-400">
                          {task.type === "CONSULT" ? "咨询" : task.category === "PAINTING" ? "绘画" : "写作"}
                        </span>
                        <span className={`text-xs font-medium ${statusInfo.color}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <p className="text-gray-900 dark:text-white text-sm truncate">{task.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-zinc-500">
                        <span>{task.creditCost} credit</span>
                        <span>{new Date(task.createdAt).toLocaleString("zh-CN")}</span>
                        {task.worker && <span>分身: {task.worker.name}</span>}
                      </div>
                    </div>
                  </div>

                  {task.result && task.status === "COMPLETED" && (
                    <div className="mt-3 p-3 bg-gray-50 dark:bg-zinc-800 rounded-lg text-sm text-gray-700 dark:text-zinc-300 max-h-24 overflow-hidden">
                      {task.resultUrl ? (
                        <img src={task.resultUrl} alt="result" className="max-h-20 rounded" />
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
