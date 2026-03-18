import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, serverError } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        avatar: true,
        bio: true,
        shades: true,
        credits: true,
        totalOrders: true,
        totalEarnings: true,
        orderMode: true,
        autoTopN: true,
        createdAt: true,
      },
    });

    if (!profile) return unauthorized();

    return NextResponse.json(profile);
  } catch (err) {
    logger.error("Profile API error", { error: (err as Error).message });
    return serverError("获取档案失败");
  }
}
