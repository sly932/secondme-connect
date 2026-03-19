import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthUser, unauthorized, badRequest, serverError } from "@/lib/api-auth";
import { executeConsultTask, executeWritingTask, executePaintingTask } from "@/lib/task-executor";
import logger from "@/lib/logger";
import { TaskType, TaskCategory, TaskStatus } from "@prisma/client";

const CREDIT_PER_CONSULT = 1;

interface MatchCandidate {
  userId: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  similarity: number;
}

// POST /api/v1/plaza/:id/consult — 手动对某个匹配候选发起咨询
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const { id: postId } = await params;
    const body = await req.json();
    const { workerId, category } = body;

    if (!workerId) return badRequest("请提供 workerId");

    // 验证帖子存在且属于当前用户
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, content: true, authorId: true, matchCandidates: true },
    });

    if (!post) return badRequest("帖子不存在");
    if (post.authorId !== user.id) return badRequest("只能对自己的帖子发起咨询");

    // 验证 workerId 在匹配候选中
    const candidates = (post.matchCandidates as MatchCandidate[] | null) ?? [];
    const candidate = candidates.find((c) => c.userId === workerId);
    if (!candidate) return badRequest("该用户不在匹配候选中");

    // 检查是否已存在同 postId + workerId 的任务
    const existing = await prisma.task.findFirst({
      where: { postId, workerId },
    });
    if (existing) {
      if (existing.status === TaskStatus.FAILED) {
        // 失败的任务允许重试 — 删除旧任务
        await prisma.task.delete({ where: { id: existing.id } });
      } else {
        return NextResponse.json({
          success: true,
          message: "已存在任务",
          task: { taskId: existing.id, status: existing.status, result: existing.result },
        });
      }
    }

    // 检查余额
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { credits: true },
    });
    if (!fullUser || fullUser.credits < CREDIT_PER_CONSULT) {
      return badRequest("credit 不足");
    }

    // 查找双方的 secondmeId
    const [publisherUser, worker] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { secondmeId: true } }),
      prisma.user.findUnique({ where: { id: workerId }, select: { secondmeId: true } }),
    ]);

    // 根据 category 决定任务类型和超时
    const isWriting = category === "WRITING";
    const isPainting = category === "PAINTING";
    const isConsult = !isWriting && !isPainting;
    const taskType = isConsult ? TaskType.CONSULT : TaskType.MARKETPLACE;
    const taskCategory = isWriting ? TaskCategory.WRITING : isPainting ? TaskCategory.PAINTING : undefined;
    const timeoutMs = isPainting ? 3 * 60 * 1000 : 2 * 60 * 1000;

    // 创建任务
    const task = await prisma.task.create({
      data: {
        type: taskType,
        ...(taskCategory && { category: taskCategory }),
        status: TaskStatus.MATCHING,
        description: post.content,
        creditCost: CREDIT_PER_CONSULT,
        publisherId: user.id,
        workerId,
        postId,
        timeoutMs,
      },
    });

    // 异步执行 — 根据 category 选择对应的执行器
    if (worker?.secondmeId) {
      if (isWriting) {
        executeWritingTask(
          task.id, user.id, workerId, worker.secondmeId, post.content, CREDIT_PER_CONSULT
        ).catch((err) =>
          logger.error("Retry writing task error", { taskId: task.id, error: err.message })
        );
      } else if (isPainting) {
        executePaintingTask(
          task.id, user.id, workerId, worker.secondmeId, post.content, CREDIT_PER_CONSULT
        ).catch((err) =>
          logger.error("Retry painting task error", { taskId: task.id, error: err.message })
        );
      } else if (publisherUser?.secondmeId) {
        executeConsultTask(
          task.id, user.id, publisherUser.secondmeId, workerId, worker.secondmeId, post.content, CREDIT_PER_CONSULT
        ).catch((err) =>
          logger.error("Manual consult task error", { taskId: task.id, error: err.message })
        );
      }
    }

    logger.info("Task started", { postId, workerId, taskId: task.id, category: category || "CONSULT" });

    return NextResponse.json({
      success: true,
      task: { taskId: task.id, status: task.status },
      worker: {
        id: candidate.userId,
        name: candidate.name,
        similarity: candidate.similarity,
      },
    }, { status: 201 });
  } catch (err) {
    logger.error("Manual consult error", { error: (err as Error).message });
    return serverError("发起咨询失败");
  }
}
