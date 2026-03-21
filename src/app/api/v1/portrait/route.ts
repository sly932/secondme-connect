import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, applyRateLimit, unauthorized, serverError } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { generatePortraitForUser } from "@/lib/portrait";
import { TaskType, TaskStatus } from "@prisma/client";

/** GET: 获取当前用户自画像 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl = applyRateLimit(req, user.id);
    if (rl) return rl;

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { portraitUrl: true, portraitPrompt: true },
    });

    return NextResponse.json({
      success: true,
      portraitUrl: profile?.portraitUrl || null,
      portraitPrompt: profile?.portraitPrompt || null,
    });
  } catch (err) {
    logger.error("Portrait GET error", { error: (err as Error).message });
    return serverError((err as Error).message);
  }
}

/** POST: 生成自画像 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl = applyRateLimit(req, user.id);
    if (rl) return rl;

    // 创建动态 Post + Task
    const post = await prisma.post.create({
      data: {
        content: "生成了自画像",
        authorId: user.id,
        matchedAt: new Date(),
      },
    });

    const task = await prisma.task.create({
      data: {
        type: TaskType.PORTRAIT,
        status: TaskStatus.EXECUTING,
        description: "生成像素风自画像",
        creditCost: 0,
        publisherId: user.id,
        workerId: user.id,
        postId: post.id,
      },
    });

    // 异步生成自画像，完成后更新 Task
    generatePortraitForUser(user.id)
      .then(async (result) => {
        await prisma.task.update({
          where: { id: task.id },
          data: {
            status: TaskStatus.COMPLETED,
            resultUrl: result.portraitUrl,
            result: result.portraitPrompt,
            completedAt: new Date(),
          },
        });
      })
      .catch(async (err) => {
        logger.error("Portrait task failed", { taskId: task.id, error: (err as Error).message });
        await prisma.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.FAILED, result: (err as Error).message },
        });
      });

    return NextResponse.json({ success: true, postId: post.id, portraitUrl: null });
  } catch (err) {
    logger.error("Portrait POST error", { error: (err as Error).message });
    return serverError((err as Error).message);
  }
}
