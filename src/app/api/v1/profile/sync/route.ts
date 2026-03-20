import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, applyRateLimit, unauthorized, serverError } from "@/lib/api-auth";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { getUserShades, getUserSoftmemory } from "@/lib/secondme";
import { generateEmbedding, buildProfileText } from "@/lib/embedding";
import { saveUserEmbedding } from "@/lib/vectors";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

export async function POST(req: NextRequest) {
  const startTime = Date.now();

  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl = applyRateLimit(req, user.id, RATE_LIMITS.sync, "profile-sync");
    if (rl) return rl;

    logger.info("Profile sync started", { userId: user.id });

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        accessToken: true,
        bio: true,
        shades: true,
        softmemory: true,
      },
    });

    if (!dbUser) return unauthorized();

    // 1. 尝试从 SecondMe 拉取最新档案，失败则用现有数据
    let shades = dbUser.shades;
    let softmemory = dbUser.softmemory;
    let pulledFromSecondMe = false;

    try {
      const [newShades, newSoftmemory] = await Promise.all([
        getUserShades(dbUser.accessToken),
        getUserSoftmemory(dbUser.accessToken),
      ]);
      if (newShades) shades = newShades;
      if (newSoftmemory) softmemory = newSoftmemory;
      pulledFromSecondMe = true;
      logger.info("Profile sync: pulled from SecondMe", { userId: user.id });
    } catch (err) {
      logger.warn("Profile sync: SecondMe pull failed, using existing data", {
        userId: user.id,
        error: (err as Error).message,
      });
    }

    // 2. 更新数据库中的档案
    if (pulledFromSecondMe) {
      await prisma.user.update({
        where: { id: user.id },
        data: { shades: shades ?? undefined, softmemory: softmemory ?? undefined },
      });
    }

    // 3. 生成 embedding
    const profileText = buildProfileText(dbUser.bio, shades, softmemory);
    if (profileText.length === 0) {
      const elapsed = Date.now() - startTime;
      logger.info("Profile sync: no profile text to embed", { userId: user.id, elapsed: `${elapsed}ms` });
      return NextResponse.json({ success: true, message: "档案内容为空，跳过向量生成", elapsed });
    }

    const embedding = await generateEmbedding(profileText);
    await saveUserEmbedding(user.id, embedding);

    const elapsed = Date.now() - startTime;
    logger.info("Profile sync completed", {
      userId: user.id,
      pulledFromSecondMe,
      dimensions: embedding.length,
      elapsed: `${elapsed}ms`,
    });

    return NextResponse.json({
      success: true,
      message: "同步档案成功",
      pulledFromSecondMe,
      dimensions: embedding.length,
      elapsed,
    });
  } catch (err) {
    const elapsed = Date.now() - startTime;
    logger.error("Profile sync failed", {
      error: (err as Error).message,
      elapsed: `${elapsed}ms`,
    });
    return serverError("同步档案失败");
  }
}
