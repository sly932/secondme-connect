import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { getAuthUser, applyRateLimit, unauthorized, serverError } from "@/lib/api-auth";
import { getRoomEvents } from "@/lib/games/game-executor";

// GET /api/v1/games/rooms/[id] — 房间详情 (含事件日志)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl = applyRateLimit(req, user.id);
    if (rl) return rl;

    const { id } = await params;

    const room = await prisma.gameRoom.findUnique({
      where: { id },
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        players: {
          include: { user: { select: { id: true, name: true, avatar: true, bio: true } } },
          orderBy: { position: "asc" },
        },
        rounds: {
          select: {
            roundNumber: true,
            status: true,
            pot: true,
            communityCards: true,
            dealerHand: true,
            resultLog: true,
            roundSnapshot: true,
            winnerId: true,
          },
          orderBy: { roundNumber: "asc" },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: "房间不存在" }, { status: 404 });
    }

    // 获取实时事件
    const events = getRoomEvents(id);

    // 从 query 获取 since 参数 (只返回该时间戳之后的事件)
    const { searchParams } = new URL(req.url);
    const since = Number(searchParams.get("since")) || 0;
    const limit = Math.min(200, Math.max(20, Number(searchParams.get("eventsLimit")) || 120));
    const filteredEvents = since > 0 ? events.filter((e) => e.timestamp > since) : events.slice(-limit);

    return NextResponse.json({
      room: {
        id: room.id,
        gameType: room.gameType,
        maxPlayers: room.maxPlayers,
        minChips: room.minChips,
        totalRounds: room.totalRounds,
        currentRound: room.currentRound,
        status: room.status,
        creator: room.creator,
        createdAt: room.createdAt,
        players: room.players.map((p) => ({
          id: p.id,
          name: p.user.name,
          avatar: p.user.avatar,
          bio: p.user.bio,
          position: p.position,
          isCreator: p.isCreator,
          isAI: p.isAI,
          chips: p.chips,
          status: p.status,
        })),
        rounds: room.rounds,
      },
      events: filteredEvents,
      totalEvents: events.length,
    });
  } catch (error) {
    logger.error("Get room detail error", { error: String(error) });
    return serverError("获取房间详情失败");
  }
}
