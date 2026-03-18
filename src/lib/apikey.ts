import { randomBytes } from "crypto";
import prisma from "./prisma";
import logger from "./logger";

/**
 * 生成 ck- 前缀的 API Key
 */
export function generateApiKey(): string {
  const key = `ck-${randomBytes(32).toString("hex")}`;
  return key;
}

/**
 * 为用户创建或刷新 API Key
 */
export async function createApiKey(userId: string): Promise<string> {
  const key = generateApiKey();
  logger.info("Creating API key for user", { userId });

  await prisma.user.update({
    where: { id: userId },
    data: { apiKey: key },
  });

  logger.info("API key created", { userId, keyPrefix: key.slice(0, 8) });
  return key;
}

/**
 * 通过 API Key 验证并获取用户
 */
export async function validateApiKey(apiKey: string) {
  if (!apiKey || !apiKey.startsWith("ck-")) {
    logger.warn("Invalid API key format", { keyPrefix: apiKey?.slice(0, 8) });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { apiKey },
    select: {
      id: true,
      name: true,
      secondmeId: true,
      credits: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiry: true,
    },
  });

  if (!user) {
    logger.warn("API key not found", { keyPrefix: apiKey.slice(0, 8) });
    return null;
  }

  logger.debug("API key validated", { userId: user.id });
  return user;
}
