import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, applyRateLimit, unauthorized, serverError } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();
    const rl = applyRateLimit(req, user.id);
    if (rl) return rl;

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const pageSize = 20;

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { credits: true, totalEarnings: true },
    });

    const [logs, total] = await Promise.all([
      prisma.creditLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.creditLog.count({ where: { userId: user.id } }),
    ]);

    return NextResponse.json({
      balance: dbUser?.credits || 0,
      totalEarnings: dbUser?.totalEarnings || 0,
      logs,
      total,
      page,
      pageSize,
    });
  } catch (err) {
    logger.error("Credits API error", { error: (err as Error).message });
    return serverError("获取 credit 信息失败");
  }
}
