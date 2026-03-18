import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, badRequest, serverError } from "@/lib/api-auth";
import { createApiKey } from "@/lib/apikey";
import prisma from "@/lib/prisma";
import logger from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const settings = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        orderMode: true,
        autoTopN: true,
        apiKey: true,
      },
    });

    return NextResponse.json(settings);
  } catch (err) {
    logger.error("Settings GET error", { error: (err as Error).message });
    return serverError("获取设置失败");
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return unauthorized();

    const body = await req.json();
    const { orderMode, autoTopN, regenerateApiKey } = body;

    const updateData: Record<string, unknown> = {};

    if (orderMode && ["AUTO", "MANUAL"].includes(orderMode)) {
      updateData.orderMode = orderMode;
    }

    if (autoTopN && autoTopN >= 1 && autoTopN <= 5) {
      updateData.autoTopN = autoTopN;
    }

    if (regenerateApiKey) {
      updateData.apiKey = await createApiKey(user.id);
      // createApiKey already updates DB, but we include it in the batch
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: updateData,
      });
    }

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      select: { orderMode: true, autoTopN: true, apiKey: true },
    });

    logger.info("Settings updated", { userId: user.id, fields: Object.keys(updateData) });
    return NextResponse.json(updated);
  } catch (err) {
    logger.error("Settings PATCH error", { error: (err as Error).message });
    return serverError("更新设置失败");
  }
}
