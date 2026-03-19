import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, unauthorized, serverError } from "@/lib/api-auth";
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
        apiKey: true,
        apiKeyPreview: true,
        apiKeyHash: true,
        fontIndex: true,
      },
    });

    return NextResponse.json({
      hasApiKey: !!(settings?.apiKeyHash || settings?.apiKey),
      apiKeyPreview: settings?.apiKeyPreview || (settings?.apiKey ? `${settings.apiKey.slice(0, 8)}••••${settings.apiKey.slice(-4)}` : null),
      fontIndex: settings?.fontIndex ?? 0,
    });
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
    const { regenerateApiKey, fontIndex } = body;

    let newApiKey: string | null = null;

    if (regenerateApiKey) {
      newApiKey = await createApiKey(user.id);
    }

    if (typeof fontIndex === "number" && fontIndex >= 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { fontIndex },
      });
    }

    const updated = await prisma.user.findUnique({
      where: { id: user.id },
      select: { apiKey: true, apiKeyPreview: true, apiKeyHash: true, fontIndex: true },
    });

    logger.info("Settings updated", { userId: user.id });
    return NextResponse.json({
      hasApiKey: !!(updated?.apiKeyHash || updated?.apiKey),
      apiKeyPreview: updated?.apiKeyPreview || (updated?.apiKey ? `${updated.apiKey.slice(0, 8)}••••${updated.apiKey.slice(-4)}` : null),
      fontIndex: updated?.fontIndex ?? 0,
      newApiKey,
    });
  } catch (err) {
    logger.error("Settings PATCH error", { error: (err as Error).message });
    return serverError("更新设置失败");
  }
}
