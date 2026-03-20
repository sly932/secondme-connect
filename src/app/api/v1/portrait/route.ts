import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, applyRateLimit, unauthorized, serverError } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";
import { generatePortraitForUser } from "@/lib/portrait";

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

    const result = await generatePortraitForUser(user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    logger.error("Portrait POST error", { error: (err as Error).message });
    return serverError((err as Error).message);
  }
}
