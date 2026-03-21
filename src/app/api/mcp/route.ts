import { NextRequest, NextResponse } from "next/server";
import { resolveUserFromSecondMeToken } from "@/lib/mcp-auth";
import { findMatchingUsers } from "@/lib/vectors";
import { executeConsultTask, executeWritingTask, executePaintingTask } from "@/lib/task-executor";
import { executeBlackjackGame, executeTexasGame } from "@/lib/games/game-executor";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { TaskType, TaskCategory, TaskStatus, GameType } from "@prisma/client";

// ── Tool Definitions ──

const TOOLS = [
  {
    name: "get_profile",
    description: "获取当前用户的档案信息，包括名称、头像、标签、积分等",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "consult",
    description: "描述你的需求，系统会匹配最合适的 AI 分身进行一对一咨询",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "需求描述" },
        topN: { type: "number", description: "匹配人数，默认 5" },
      },
      required: ["description"],
    },
  },
  {
    name: "create_task",
    description: "创建写作或绘画任务，系统自动匹配 AI 分身执行",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "任务描述" },
        category: { type: "string", enum: ["WRITING", "PAINTING"], description: "任务类型" },
        topN: { type: "number", description: "匹配人数，默认 5" },
      },
      required: ["description", "category"],
    },
  },
  {
    name: "create_game_room",
    description: "开一个游戏房间（21点或德州扑克），系统自动匹配 AI 对手",
    inputSchema: {
      type: "object",
      properties: {
        gameType: { type: "string", enum: ["BLACKJACK", "TEXAS_HOLDEM"], description: "游戏类型" },
        maxPlayers: { type: "number", description: "玩家人数 2-8，默认 21点4人/德州6人" },
        minChips: { type: "number", description: "每局最小筹码，默认 10" },
        totalRounds: { type: "number", description: "总局数 1-20，默认 5" },
      },
      required: ["gameType"],
    },
  },
  {
    name: "list_game_rooms",
    description: "查看游戏房间列表，可按状态筛选",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["PLAYING", "COMPLETED", "all"], description: "筛选状态，默认全部" },
      },
      required: [],
    },
  },
  {
    name: "list_plaza",
    description: "浏览广场帖子，查看最新动态",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", description: "页码，默认 1" },
        search: { type: "string", description: "搜索关键词" },
      },
      required: [],
    },
  },
];

// ── Tool Handlers ──

type UserId = { id: string; name: string; credits: number };

function textResult(data: unknown) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function errorResult(msg: string) {
  return { content: [{ type: "text", text: msg }], isError: true };
}

async function handleGetProfile(user: UserId) {
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true, name: true, avatar: true, bio: true, shades: true,
      credits: true, totalOrders: true, totalEarnings: true, createdAt: true,
    },
  });
  return textResult(profile);
}

async function handleConsult(user: UserId, args: Record<string, unknown>) {
  const description = args.description as string;
  if (!description) return errorResult("请提供需求描述");

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, credits: true, autoTopN: true, secondmeId: true },
  });
  if (!fullUser) return errorResult("用户不存在");

  const candidates = await findMatchingUsers(description, user.id, 5);
  if (candidates.length === 0) return textResult({ message: "未找到匹配的分身", candidates: [] });

  const topN = (args.topN as number) || fullUser.autoTopN;
  const selected = candidates.slice(0, Math.min(topN, candidates.length));
  const totalCost = selected.length;

  if (fullUser.credits < totalCost) return errorResult(`余额不足，需要 ${totalCost} credit，当前 ${fullUser.credits}`);

  const tasks = await Promise.all(
    selected.map(async (candidate) => {
      const task = await prisma.task.create({
        data: {
          type: TaskType.CONSULT, status: TaskStatus.MATCHING,
          description, creditCost: 1,
          publisherId: user.id, workerId: candidate.id, timeoutMs: 2 * 60 * 1000,
        },
      });
      executeConsultTask(task.id, user.id, fullUser.secondmeId, candidate.id, candidate.secondmeId, description, 1)
        .catch((e) => logger.error("MCP consult error", { taskId: task.id, error: e.message }));
      return { taskId: task.id, worker: { name: candidate.name, similarity: Math.round(candidate.similarity * 100) / 100 } };
    })
  );

  return textResult({ totalCost, tasks, message: `已向 ${tasks.length} 个分身发起咨询` });
}

async function handleCreateTask(user: UserId, args: Record<string, unknown>) {
  const description = args.description as string;
  const category = args.category as string;
  if (!description) return errorResult("请提供任务描述");
  if (!category || !["WRITING", "PAINTING"].includes(category)) return errorResult("category 必须是 WRITING 或 PAINTING");

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, credits: true, autoTopN: true },
  });
  if (!fullUser) return errorResult("用户不存在");

  const candidates = await findMatchingUsers(description, user.id, 5);
  if (candidates.length === 0) return textResult({ message: "未找到匹配的分身" });

  const topN = (args.topN as number) || fullUser.autoTopN;
  const selected = candidates.slice(0, Math.min(topN, candidates.length));
  const totalCost = selected.length;

  if (fullUser.credits < totalCost) return errorResult(`余额不足，需要 ${totalCost} credit`);

  const post = await prisma.post.create({
    data: {
      content: description, authorId: user.id,
      matchCandidates: selected.map((c) => ({ userId: c.id, name: c.name, similarity: Math.round(c.similarity * 100) / 100 })),
      matchedAt: new Date(),
    },
  });

  const timeoutMs = category === "WRITING" ? 2 * 60 * 1000 : 3 * 60 * 1000;
  const tasks = await Promise.all(
    selected.map(async (candidate) => {
      const task = await prisma.task.create({
        data: {
          type: TaskType.MARKETPLACE, category: category as TaskCategory,
          status: TaskStatus.MATCHING, description,
          creditCost: 1, publisherId: user.id, workerId: candidate.id, postId: post.id, timeoutMs,
        },
      });
      const executor = category === "WRITING" ? executeWritingTask : executePaintingTask;
      executor(task.id, user.id, candidate.id, candidate.secondmeId, description, 1)
        .catch((e) => logger.error("MCP task error", { taskId: task.id, error: e.message }));
      return { taskId: task.id, category, worker: { name: candidate.name } };
    })
  );

  return textResult({ totalCost, tasks, postId: post.id });
}

async function handleCreateGameRoom(user: UserId, args: Record<string, unknown>) {
  const gameType = args.gameType as GameType;
  if (!gameType || !["BLACKJACK", "TEXAS_HOLDEM"].includes(gameType)) return errorResult("gameType 必须是 BLACKJACK 或 TEXAS_HOLDEM");

  const players = (args.maxPlayers as number) || (gameType === "BLACKJACK" ? 4 : 6);
  const chips = (args.minChips as number) || 10;
  const rounds = (args.totalRounds as number) || 5;

  if (players < 2 || players > 8) return errorResult("人数限制 2-8");
  if (rounds < 1 || rounds > 20) return errorResult("局数范围 1-20");

  const totalCost = chips * rounds;
  const aiUserCount = players - 1;

  const candidateWhere = { autoJoinGame: true, id: { not: user.id } } as const;
  const availableCount = await prisma.user.count({ where: candidateWhere });
  if (availableCount < aiUserCount) return errorResult(`AI 玩家不足，需要 ${aiUserCount} 人，当前仅 ${availableCount} 人`);

  const candidatePool = await prisma.user.findMany({
    where: candidateWhere, select: { id: true, name: true },
    orderBy: { id: "asc" }, take: Math.min(Math.max(aiUserCount * 10, 20), 200),
  });
  const aiUsers = [...candidatePool].sort(() => Math.random() - 0.5).slice(0, aiUserCount);

  try {
    const room = await prisma.$transaction(async (tx) => {
      const creator = await tx.user.findUnique({ where: { id: user.id }, select: { credits: true } });
      if (!creator || creator.credits < totalCost) throw new Error("INSUFFICIENT_CREDITS");

      const updated = await tx.user.update({
        where: { id: user.id }, data: { credits: { decrement: totalCost } }, select: { credits: true },
      });
      await tx.creditLog.create({
        data: {
          userId: user.id, amount: -totalCost, balance: updated.credits,
          reason: `创建${gameType === "BLACKJACK" ? "21点" : "德州扑克"}房间 (${chips}×${rounds}局)`,
        },
      });

      return await tx.gameRoom.create({
        data: {
          gameType, maxPlayers: players, minChips: chips, totalRounds: rounds, creatorId: user.id,
          players: {
            create: [
              { userId: user.id, position: 0, isCreator: true, isAI: false, chips: totalCost },
              ...aiUsers.map((ai, idx) => ({ userId: ai.id, position: idx + 1, isCreator: false, isAI: true, chips: chips * rounds })),
            ],
          },
        },
        include: { players: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
      });
    }, { timeout: 15000 });

    const executor = gameType === "BLACKJACK" ? executeBlackjackGame : executeTexasGame;
    executor(room.id).catch((e) => logger.error("MCP game failed", { roomId: room.id, error: String(e) }));

    const baseUrl = process.env.NEXTAUTH_URL || "https://a2aconnect.online";
    return textResult({
      roomId: room.id, gameType, players, rounds,
      spectateUrl: `${baseUrl}/games/${room.id}`,
      playerList: room.players.map((p) => ({ name: p.user.name, isAI: p.isAI, chips: p.chips })),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INSUFFICIENT_CREDITS") {
      return errorResult(`积分不足，需要 ${totalCost} credit (${chips} × ${rounds} 局)`);
    }
    throw e;
  }
}

async function handleListGameRooms(user: UserId, args: Record<string, unknown>) {
  const where: Record<string, unknown> = {};
  const status = args.status as string;
  if (status && status !== "all") where.status = status;

  const rooms = await prisma.gameRoom.findMany({
    where, orderBy: { createdAt: "desc" }, take: 20,
    include: {
      creator: { select: { id: true, name: true } },
      players: { include: { user: { select: { name: true } } }, orderBy: { position: "asc" } },
    },
  });

  void user; // authenticated but not filtered by user
  const baseUrl = process.env.NEXTAUTH_URL || "https://a2aconnect.online";
  return textResult(rooms.map((r) => ({
    id: r.id, gameType: r.gameType, status: r.status,
    creator: r.creator.name, currentRound: r.currentRound, totalRounds: r.totalRounds,
    players: r.players.map((p) => p.user.name),
    spectateUrl: `${baseUrl}/games/${r.id}`,
  })));
}

async function handleListPlaza(args: Record<string, unknown>) {
  const page = (args.page as number) || 1;
  const limit = 10;
  const search = args.search as string;
  const where = search ? { content: { contains: search, mode: "insensitive" as const } } : {};

  const posts = await prisma.post.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
    include: { author: { select: { name: true, avatar: true } }, _count: { select: { comments: true } } },
  });

  return textResult(posts.map((p) => ({
    id: p.id, content: p.content?.slice(0, 200), author: p.author.name,
    comments: p._count.comments, createdAt: p.createdAt,
  })));
}

// ── JSON-RPC Handler ──

function jsonrpcResponse(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function jsonrpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    const user = token ? await resolveUserFromSecondMeToken(token) : null;

    const body = await req.json();
    const { method, params, id } = body;

    let response;

    switch (method) {
      case "initialize":
        response = jsonrpcResponse(id, {
          protocolVersion: "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "connect", version: "1.0.0" },
        });
        break;

      case "tools/list":
        response = jsonrpcResponse(id, { tools: TOOLS });
        break;

      case "tools/call": {
        const toolName = params?.name;
        const args = params?.arguments || {};

        // list_plaza 不要求认证
        if (toolName !== "list_plaza" && !user) {
          response = jsonrpcResponse(id, errorResult("未认证，请提供有效的 SecondMe token"));
          break;
        }

        let result;
        switch (toolName) {
          case "get_profile": result = await handleGetProfile(user!); break;
          case "consult": result = await handleConsult(user!, args); break;
          case "create_task": result = await handleCreateTask(user!, args); break;
          case "create_game_room": result = await handleCreateGameRoom(user!, args); break;
          case "list_game_rooms": result = await handleListGameRooms(user!, args); break;
          case "list_plaza": result = await handleListPlaza(args); break;
          default: result = errorResult(`未知工具: ${toolName}`);
        }

        response = jsonrpcResponse(id, result);
        break;
      }

      case "notifications/initialized":
        // 通知，不需要响应
        return new NextResponse(null, { status: 204 });

      case "ping":
        response = jsonrpcResponse(id, {});
        break;

      default:
        response = jsonrpcError(id, -32601, `Method not found: ${method}`);
    }

    return NextResponse.json(response, {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    logger.error("MCP handler error", { error: String(err) });
    return NextResponse.json(
      jsonrpcError(null, -32603, "Internal server error"),
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    name: "connect",
    version: "1.0.0",
    description: "Connect — AI 社交平台，支持咨询匹配、任务创建、游戏房间、广场浏览",
    tools: TOOLS.map((t) => t.name),
  });
}
