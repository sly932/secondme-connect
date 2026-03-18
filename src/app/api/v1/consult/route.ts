import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest, serverError } from "@/lib/api-auth";
import { findMatchingUsers } from "@/lib/vectors";
import { executeConsultTask } from "@/lib/task-executor";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { TaskType, TaskStatus } from "@prisma/client";

const CREDIT_PER_CONSULT = 1;

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const { description, mode, topN = 1 } = body;

    if (!description || typeof description !== "string") {
      return badRequest("请提供需求描述 (description)");
    }

    logger.info("Consult request", { userId: user.id, description: description.slice(0, 100) });

    // 获取用户完整信息
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, credits: true, orderMode: true, autoTopN: true, secondmeId: true },
    });
    if (!fullUser) return unauthorized();

    const effectiveMode = mode || fullUser.orderMode;
    const effectiveTopN = topN || fullUser.autoTopN;

    // 匹配分身（向量优先，fallback BM25）
    const candidates = await findMatchingUsers(description, user.id, 10);

    if (candidates.length === 0) {
      return NextResponse.json({ message: "未找到匹配的分身", candidates: [] });
    }

    // 手动模式: 返回候选列表
    if (effectiveMode === "MANUAL") {
      return NextResponse.json({
        mode: "MANUAL",
        candidates: candidates.map((c) => ({
          id: c.id,
          name: c.name,
          avatar: c.avatar,
          bio: c.bio,
          similarity: Math.round(c.similarity * 100) / 100,
        })),
      });
    }

    // 自动模式: 取 Top N 直接执行
    const selected = candidates.slice(0, Math.min(effectiveTopN, candidates.length));
    const totalCost = selected.length * CREDIT_PER_CONSULT;

    if (fullUser.credits < totalCost) {
      return badRequest(`余额不足，需要 ${totalCost} credit，当前余额 ${fullUser.credits}`);
    }

    // 创建任务并执行
    const tasks = await Promise.all(
      selected.map(async (candidate) => {
        const task = await prisma.task.create({
          data: {
            type: TaskType.CONSULT,
            status: TaskStatus.MATCHING,
            description,
            creditCost: CREDIT_PER_CONSULT,
            publisherId: user.id,
            workerId: candidate.id,
            timeoutMs: 2 * 60 * 1000,
          },
        });

        // 异步执行（不阻塞响应）
        executeConsultTask(
          task.id,
          user.id,
          fullUser.secondmeId,
          candidate.id,
          candidate.secondmeId,
          description,
          CREDIT_PER_CONSULT
        ).catch((err) => logger.error("Consult task execution error", { taskId: task.id, error: err.message }));

        return {
          taskId: task.id,
          worker: {
            id: candidate.id,
            name: candidate.name,
            avatar: candidate.avatar,
            similarity: Math.round(candidate.similarity * 100) / 100,
          },
        };
      })
    );

    return NextResponse.json({
      mode: "AUTO",
      totalCost,
      tasks,
      message: `已向 ${tasks.length} 个分身发起咨询`,
    });
  } catch (err) {
    logger.error("Consult API error", { error: (err as Error).message });
    return serverError("咨询请求处理失败");
  }
}
