import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { getAuthUser, applyRateLimit, unauthorized, badRequest, serverError } from "@/lib/api-auth";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { executeBlackjackGame, executeTexasGame } from "@/lib/games/game-executor";

// POST /api/v1/games/rooms — 创建房间并开始游戏
export async function POST(req: NextRequest) {
  let totalCost = 0;
  let chips = 0;
  let rounds = 0;

  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl = applyRateLimit(req, user.id, RATE_LIMITS.gameCreate, "game-create");
    if (rl) return rl;

    const body = await req.json();
    const { gameType, maxPlayers, minChips, totalRounds } = body;

    // 校验
    if (!gameType || !["BLACKJACK", "TEXAS_HOLDEM"].includes(gameType)) {
      return badRequest("gameType 必须是 BLACKJACK 或 TEXAS_HOLDEM");
    }

    const players = maxPlayers || (gameType === "BLACKJACK" ? 4 : 6);
    chips = minChips || 10;
    rounds = totalRounds || 5;

    if (players < 2 || players > 8) return badRequest("人数限制 2-8");
    if (chips < 1) return badRequest("最小筹码不能小于 1");
    if (rounds < 1 || rounds > 20) return badRequest("局数范围 1-20");

    totalCost = chips * rounds;

    const aiUserCount = players - 1;
    const candidateWhere = { autoJoinGame: true, id: { not: user.id } } as const;
    const availableCount = await prisma.user.count({ where: candidateWhere });
    if (availableCount < aiUserCount) {
      return badRequest(`可用的 AI 玩家不足，需要 ${aiUserCount} 人，当前仅 ${availableCount} 人可用`);
    }

    const candidatePoolSize = Math.min(Math.max(aiUserCount * 10, 20), 200);
    const skip = availableCount > candidatePoolSize
      ? Math.floor(Math.random() * (availableCount - candidatePoolSize + 1))
      : 0;

    const candidatePool = await prisma.user.findMany({
      where: candidateWhere,
      select: { id: true, name: true },
      orderBy: { id: "asc" },
      skip,
      take: candidatePoolSize,
    });

    const aiUsers = [...candidatePool]
      .sort(() => Math.random() - 0.5)
      .slice(0, aiUserCount);

    const room = await prisma.$transaction(async (tx) => {
      const creator = await tx.user.findUnique({
        where: { id: user.id },
        select: { credits: true },
      });

      if (!creator || creator.credits < totalCost) {
        throw new Error("INSUFFICIENT_CREDITS");
      }

      const updatedCreator = await tx.user.update({
        where: { id: user.id },
        data: { credits: { decrement: totalCost } },
        select: { credits: true },
      });

      await tx.creditLog.create({
        data: {
          userId: user.id,
          amount: -totalCost,
          balance: updatedCreator.credits,
          reason: `创建${gameType === "BLACKJACK" ? "21点" : "德州扑克"}房间 (${chips}×${rounds}局)`,
        },
      });

      return await tx.gameRoom.create({
        data: {
          gameType,
          maxPlayers: players,
          minChips: chips,
          totalRounds: rounds,
          creatorId: user.id,
          players: {
            create: [
              {
                userId: user.id,
                position: 0,
                isCreator: true,
                isAI: false,
                chips: totalCost,
              },
              ...aiUsers.map((ai, idx) => ({
                userId: ai.id,
                position: idx + 1,
                isCreator: false,
                isAI: true,
                chips: chips * rounds,
              })),
            ],
          },
        },
        include: {
          players: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        },
      });
    }, { timeout: 15000 });

    logger.info("Game room created", { roomId: room.id, gameType, players, rounds });

    // 异步启动游戏
    const executor = gameType === "BLACKJACK" ? executeBlackjackGame : executeTexasGame;
    executor(room.id).catch((err) => {
      logger.error("Game execution failed", { roomId: room.id, error: String(err) });
      prisma.gameRoom.update({
        where: { id: room.id },
        data: { status: "CANCELLED" },
      }).catch(() => {});
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    return NextResponse.json({
      success: true,
      room: {
        id: room.id,
        gameType: room.gameType,
        maxPlayers: room.maxPlayers,
        minChips: room.minChips,
        totalRounds: room.totalRounds,
        status: room.status,
        players: room.players.map((p) => ({
          id: p.id,
          name: p.user.name,
          avatar: p.user.avatar,
          position: p.position,
          isCreator: p.isCreator,
          isAI: p.isAI,
          chips: p.chips,
        })),
        spectateUrl: `${baseUrl}/games/${room.id}`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") {
      return badRequest(`Credit 不足。需要 ${totalCost} credit (${chips} × ${rounds} 局)`);
    }
    logger.error("Create room error", { error: String(error) });
    return serverError("创建房间失败");
  }
}

// GET /api/v1/games/rooms — 查看房间列表
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl2 = applyRateLimit(req, user.id);
    if (rl2) return rl2;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status"); // PLAYING | COMPLETED | all

    const where: Record<string, unknown> = {};
    if (status && status !== "all") {
      where.status = status;
    }

    const rooms = await prisma.gameRoom.findMany({
      where,
      include: {
        creator: { select: { id: true, name: true, avatar: true } },
        players: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { position: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    return NextResponse.json({
      rooms: rooms.map((r) => ({
        id: r.id,
        gameType: r.gameType,
        maxPlayers: r.maxPlayers,
        minChips: r.minChips,
        totalRounds: r.totalRounds,
        currentRound: r.currentRound,
        status: r.status,
        creator: r.creator,
        players: r.players.map((p) => ({
          id: p.id,
          name: p.user.name,
          avatar: p.user.avatar,
          position: p.position,
          isCreator: p.isCreator,
          isAI: p.isAI,
          chips: p.chips,
          status: p.status,
        })),
        spectateUrl: `${baseUrl}/games/${r.id}`,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    logger.error("List rooms error", { error: String(error) });
    return serverError("获取房间列表失败");
  }
}
