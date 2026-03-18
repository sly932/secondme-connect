import { NextRequest } from "next/server";
import { taskEvents } from "@/lib/task-events";
import prisma from "@/lib/prisma";

/**
 * GET /api/v1/tasks/:id/stream — SSE 端点，实时推送任务进度
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;

  // 先查任务当前状态
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, result: true, resultUrl: true },
  });

  if (!task) {
    return new Response("Task not found", { status: 404 });
  }

  // 如果任务已完成/失败，直接返回最终结果（不需要 SSE）
  if (["COMPLETED", "FAILED", "CANCELLED"].includes(task.status)) {
    const encoder = new TextEncoder();
    const body = encoder.encode(
      `data: ${JSON.stringify({ result: task.result, status: task.status, resultUrl: task.resultUrl })}\n\n` +
      `data: [DONE]\n\n`
    );
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // SSE 流
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const send = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          // controller closed
        }
      };

      // 发送当前状态
      if (task.result) {
        send(JSON.stringify({ result: task.result, status: task.status }));
      }

      // 监听事件总线
      const unsubscribe = taskEvents.subscribe(taskId, (event) => {
        send(JSON.stringify(event));

        // 终态时关闭流
        if (event.status === "COMPLETED" || event.status === "FAILED") {
          send("[DONE]");
          unsubscribe();
          try { controller.close(); } catch { /* already closed */ }
        }
      });

      // 5 分钟超时自动关闭
      const timeout = setTimeout(() => {
        unsubscribe();
        send("[DONE]");
        try { controller.close(); } catch { /* already closed */ }
      }, 5 * 60 * 1000);

      // 客户端断开时清理
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        clearTimeout(timeout);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
