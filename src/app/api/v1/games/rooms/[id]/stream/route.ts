import { NextRequest } from "next/server";
import logger from "@/lib/logger";
import { getAuthUser } from "@/lib/api-auth";
import { getRoomEvents } from "@/lib/games/game-executor";
import prisma from "@/lib/prisma";

// GET /api/v1/games/rooms/[id]/stream — SSE 实时事件流
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: roomId } = await params;
  const since = Number(new URL(req.url).searchParams.get("since")) || 0;

  // 验证房间存在
  const room = await prisma.gameRoom.findUnique({ where: { id: roomId } });
  if (!room) {
    return new Response("Room not found", { status: 404 });
  }

  logger.info("SSE stream opened", { roomId, userId: user.id });

  const encoder = new TextEncoder();
  let lastEventIndex = 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      // 发送已有事件
      const existingEvents = getRoomEvents(roomId);
      const initialEvents = since > 0
        ? existingEvents.filter((event) => event.timestamp > since)
        : existingEvents;
      for (const event of initialEvents) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }
      lastEventIndex = existingEvents.length;

      // 轮询新事件
      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        const events = getRoomEvents(roomId);
        while (lastEventIndex < events.length) {
          const event = events[lastEventIndex];
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
            );
          } catch {
            clearInterval(interval);
            return;
          }
          lastEventIndex++;
        }

        // 如果游戏结束，发送完成事件并关闭
        if (
          events.length > 0 &&
          events[events.length - 1].message === "游戏结束！"
        ) {
          try {
            controller.enqueue(encoder.encode(`data: {"type":"done"}\n\n`));
            controller.close();
          } catch {
            // ignore
          }
          clearInterval(interval);
        }
      }, 300);

      // 超时关闭 (10分钟)
      setTimeout(() => {
        closed = true;
        try {
          controller.close();
        } catch {
          // ignore
        }
      }, 600000);
    },
    cancel() {
      closed = true;
      logger.info("SSE stream closed", { roomId });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
