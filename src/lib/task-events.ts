/**
 * 任务进度事件总线 — 内存级 pub/sub
 * task-executor 写入进度时 emit，SSE 端点 subscribe 后推给客户端
 */

type TaskEvent = {
  result: string;
  status: string;
  resultUrl?: string | null;
};

type Listener = (event: TaskEvent) => void;

class TaskEventBus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(taskId: string, listener: Listener): () => void {
    if (!this.listeners.has(taskId)) {
      this.listeners.set(taskId, new Set());
    }
    this.listeners.get(taskId)!.add(listener);

    // 返回 unsubscribe 函数
    return () => {
      const set = this.listeners.get(taskId);
      if (set) {
        set.delete(listener);
        if (set.size === 0) this.listeners.delete(taskId);
      }
    };
  }

  emit(taskId: string, event: TaskEvent) {
    const set = this.listeners.get(taskId);
    if (set) {
      for (const listener of set) {
        listener(event);
      }
    }
  }
}

export const taskEvents = new TaskEventBus();
