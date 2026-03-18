import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest, serverError } from "@/lib/api-auth";
import { generateEmbedding } from "@/lib/embedding";
import { searchSimilarUsers } from "@/lib/vectors";
import { executeWritingTask, executePaintingTask } from "@/lib/task-executor";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { TaskType, TaskCategory, TaskStatus } from "@prisma/client";

const CREDIT_WRITING = 1;
const CREDIT_PAINTING = 1;

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const { description, category, mode, topN = 1 } = body;

    if (!description) return badRequest("请提供任务描述 (description)");
    if (!category || !["WRITING", "PAINTING"].includes(category)) {
      return badRequest("请提供任务类型 (category): WRITING 或 PAINTING");
    }

    const creditCost = category === "WRITING" ? CREDIT_WRITING : CREDIT_PAINTING;

    logger.info("Task creation request", { userId: user.id, category });

    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, credits: true, orderMode: true, autoTopN: true },
    });
    if (!fullUser) return unauthorized();

    const effectiveMode = mode || fullUser.orderMode;
    const effectiveTopN = topN || fullUser.autoTopN;

    // 向量匹配
    const queryEmbedding = await generateEmbedding(description);
    const candidates = await searchSimilarUsers(queryEmbedding, user.id, 10);

    if (candidates.length === 0) {
      return NextResponse.json({ message: "未找到匹配的分身", candidates: [] });
    }

    if (effectiveMode === "MANUAL") {
      return NextResponse.json({
        mode: "MANUAL",
        category,
        creditCost,
        candidates: candidates.map((c) => ({
          id: c.id,
          name: c.name,
          avatar: c.avatar,
          bio: c.bio,
          similarity: Math.round(c.similarity * 100) / 100,
        })),
      });
    }

    // 自动模式
    const selected = candidates.slice(0, Math.min(effectiveTopN, candidates.length));
    const totalCost = selected.length * creditCost;

    if (fullUser.credits < totalCost) {
      return badRequest(`余额不足，需要 ${totalCost} credit`);
    }

    const timeoutMs = category === "WRITING" ? 2 * 60 * 1000 : 3 * 60 * 1000;

    const tasks = await Promise.all(
      selected.map(async (candidate) => {
        const task = await prisma.task.create({
          data: {
            type: TaskType.MARKETPLACE,
            category: category as TaskCategory,
            status: TaskStatus.MATCHING,
            description,
            creditCost,
            publisherId: user.id,
            workerId: candidate.id,
            timeoutMs,
          },
        });

        const executor =
          category === "WRITING" ? executeWritingTask : executePaintingTask;

        executor(
          task.id,
          user.id,
          candidate.id,
          candidate.secondme_id,
          description,
          creditCost
        ).catch((err) =>
          logger.error("Task execution error", { taskId: task.id, error: err.message })
        );

        return {
          taskId: task.id,
          category,
          worker: {
            id: candidate.id,
            name: candidate.name,
            avatar: candidate.avatar,
          },
        };
      })
    );

    return NextResponse.json({
      mode: "AUTO",
      totalCost,
      tasks,
    });
  } catch (err) {
    logger.error("Task API error", { error: (err as Error).message });
    return serverError("任务创建失败");
  }
}

/** GET /api/v1/tasks - 获取用户的任务列表 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const url = new URL(req.url);
    const tab = url.searchParams.get("tab") || "published"; // published | received
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = 20;

    const where =
      tab === "received"
        ? { workerId: user.id }
        : { publisherId: user.id };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          publisher: { select: { id: true, name: true, avatar: true } },
          worker: { select: { id: true, name: true, avatar: true } },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return NextResponse.json({ tasks, total, page, pageSize });
  } catch (err) {
    logger.error("Task list error", { error: (err as Error).message });
    return serverError("获取任务列表失败");
  }
}
