import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, applyRateLimit, unauthorized, serverError } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

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

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        publisher: { select: { id: true, name: true, avatar: true } },
        worker: { select: { id: true, name: true, avatar: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // 只有发布者或接单者可以查看
    if (task.publisherId !== user.id && task.workerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(task);
  } catch (err) {
    logger.error("Task detail error", { error: (err as Error).message });
    return serverError("获取任务详情失败");
  }
}
