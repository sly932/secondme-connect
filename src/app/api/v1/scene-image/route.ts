import { NextRequest, NextResponse } from "next/server";
import {
  getAuthUser,
  applyRateLimit,
  unauthorized,
  badRequest,
  serverError,
} from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import {
  generateAndUploadSceneImage,
  SCENE_PROMPTS,
  SCENE_TYPES,
  type SceneType,
} from "@/lib/scene-image";

/**
 * GET: 查询可用场景列表
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const scenes = SCENE_TYPES.map((key) => ({
      key,
      label: SCENE_PROMPTS[key].label,
      excludePublisher: SCENE_PROMPTS[key].excludePublisher || false,
    }));

    return NextResponse.json({ success: true, scenes });
  } catch (err) {
    logger.error("Scene image GET error", { error: (err as Error).message });
    return serverError((err as Error).message);
  }
}

/**
 * POST: 生成场景合成图
 *
 * Body:
 * {
 *   scene: SceneType,                   // 场景类型
 *   userIds: string[],                  // 参与者 userId，第一个是发起者
 *   storageKey?: string,                // 可选，自定义存储 key（默认用时间戳）
 *   extraPrompt?: string,              // 可选，追加提示词
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl = applyRateLimit(req, user.id, undefined, "scene-image");
    if (rl) return rl;

    const body = await req.json();
    const { scene, userIds, storageKey, extraPrompt } = body;

    // 参数校验
    if (!scene || !SCENE_TYPES.includes(scene as SceneType)) {
      return badRequest(
        `Invalid scene type. Available: ${SCENE_TYPES.join(", ")}`
      );
    }

    if (!Array.isArray(userIds) || userIds.length < 2) {
      return badRequest("userIds must be an array with at least 2 user IDs");
    }

    // 查询参与者自画像
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, portraitUrl: true },
    });

    // 按 userIds 顺序排列（第一个是发起者）
    const orderedUsers = userIds
      .map((id: string) => users.find((u) => u.id === id))
      .filter(Boolean) as typeof users;

    // 检查所有用户是否有自画像
    const missing = orderedUsers.filter((u) => !u.portraitUrl);
    if (missing.length > 0) {
      return badRequest(
        `以下用户没有自画像: ${missing.map((u) => u.name || u.id).join(", ")}`
      );
    }

    // 下载自画像并转为 data URL
    const portraitDataUrls = await Promise.all(
      orderedUsers.map(async (u) => {
        const res = await fetch(u.portraitUrl!);
        if (!res.ok) throw new Error(`Failed to download portrait for ${u.id}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = res.headers.get("content-type") || "image/png";
        return `data:${mime};base64,${buf.toString("base64")}`;
      })
    );

    logger.info("Scene image: starting generation", {
      scene,
      userIds,
      userId: user.id,
    });

    const key = storageKey || `scene_${Date.now()}`;

    const result = await generateAndUploadSceneImage({
      scene: scene as SceneType,
      portraitDataUrls,
      extraPrompt,
      storageKey: key,
    });

    return NextResponse.json({
      success: true,
      scene,
      imageUrl: result.url,
      prompt: result.prompt,
      participants: orderedUsers.map((u) => ({
        id: u.id,
        name: u.name,
      })),
    });
  } catch (err) {
    logger.error("Scene image POST error", { error: (err as Error).message });
    return serverError((err as Error).message);
  }
}
