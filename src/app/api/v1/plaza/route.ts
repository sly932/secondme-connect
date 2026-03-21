import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, applyRateLimit, unauthorized, badRequest, serverError } from "@/lib/api-auth";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { findMatchingUsers } from "@/lib/vectors";
import { executeConsultTask } from "@/lib/task-executor";
import logger from "@/lib/logger";
import { TaskType, TaskStatus } from "@prisma/client";

const CREDIT_PER_CONSULT = 1;

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req);
  if (rl) return rl;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 10));
  const search = searchParams.get("search")?.trim();
  const authorId = searchParams.get("authorId")?.trim();

  const where: Record<string, unknown> = {};
  if (search) where.content = { contains: search, mode: "insensitive" as const };
  if (authorId) where.authorId = authorId;

  const [posts, total] = await Promise.all([
    prisma.post.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        author: { select: { id: true, name: true, avatar: true, isNpc: true } },
        tasks: {
          take: 1,
          orderBy: { createdAt: "asc" },
          select: { type: true, category: true },
        },
        _count: { select: { comments: true, tasks: true } },
      },
    }),
    prisma.post.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    posts: posts.map((p) => {
      const firstTask = p.tasks[0];
      return {
        id: p.id,
        content: p.content,
        author: p.author,
        commentCount: p._count.comments,
        matchCount: p._count.tasks,
        taskCategory: firstTask?.category || null,
        taskType: firstTask?.type || "CONSULT",
        createdAt: p.createdAt,
      };
    }),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl2 = applyRateLimit(req, user.id, RATE_LIMITS.heavy, "plaza-post");
    if (rl2) return rl2;

    const body = await req.json();
    const content = body.content?.trim();
    if (!content) return badRequest("content 不能为空");

    // 获取用户完整信息
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, credits: true, autoTopN: true, secondmeId: true },
    });
    if (!fullUser) return unauthorized();

    // 匹配分身（向量优先，fallback BM25）
    const candidates = await findMatchingUsers(content, user.id, 5);
    const matchCandidates = candidates.map((c) => ({
      userId: c.id,
      name: c.name,
      avatar: c.avatar,
      bio: c.bio,
      similarity: Math.round(c.similarity * 100) / 100,
    }));

    // 创建帖子（含匹配结果快照）
    const post = await prisma.post.create({
      data: {
        content,
        authorId: user.id,
        matchCandidates: matchCandidates.length > 0 ? matchCandidates : undefined,
        matchedAt: matchCandidates.length > 0 ? new Date() : undefined,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true, isNpc: true } },
      },
    });

    logger.info("Post created with matching", { postId: post.id, matchCount: matchCandidates.length });

    // 决定是否自动发起咨询
    let tasks: { taskId: string; worker: { id: string; name: string; avatar: string | null; similarity: number } }[] = [];

    if (matchCandidates.length > 0) {
      const selected = matchCandidates.slice(0, Math.min(fullUser.autoTopN, matchCandidates.length));
      const totalCost = selected.length * CREDIT_PER_CONSULT;

      // 余额不足时降级：取能负担的数量
      const affordable = Math.min(selected.length, Math.floor(fullUser.credits / CREDIT_PER_CONSULT));

      if (affordable > 0) {
        const toConsult = selected.slice(0, affordable);

        tasks = await Promise.all(
          toConsult.map(async (candidate) => {
            // 查找候选用户的 secondmeId
            const workerUser = await prisma.user.findUnique({
              where: { id: candidate.userId },
              select: { secondmeId: true },
            });

            const task = await prisma.task.create({
              data: {
                type: TaskType.CONSULT,
                status: TaskStatus.MATCHING,
                description: content,
                creditCost: CREDIT_PER_CONSULT,
                publisherId: user.id,
                workerId: candidate.userId,
                postId: post.id,
                timeoutMs: 2 * 60 * 1000,
              },
            });

            // 异步执行
            if (workerUser?.secondmeId && fullUser.secondmeId) {
              executeConsultTask(
                task.id,
                user.id,
                fullUser.secondmeId,
                candidate.userId,
                workerUser.secondmeId,
                content,
                CREDIT_PER_CONSULT
              ).catch((err) =>
                logger.error("Auto consult task error", { taskId: task.id, error: err.message })
              );
            }

            return {
              taskId: task.id,
              worker: {
                id: candidate.userId,
                name: candidate.name,
                avatar: candidate.avatar,
                similarity: candidate.similarity,
              },
            };
          })
        );

        logger.info("Auto consult tasks created", { postId: post.id, taskCount: tasks.length });
      }
    }

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        content: post.content,
        author: post.author,
        createdAt: post.createdAt,
      },
      mode: "AUTO",
      matchCount: matchCandidates.length,
      candidates: matchCandidates,
      tasks: tasks.length > 0 ? tasks : undefined,
    }, { status: 201 });
  } catch (err) {
    logger.error("Plaza POST error", { error: (err as Error).message });
    return serverError("发布失败");
  }
}
