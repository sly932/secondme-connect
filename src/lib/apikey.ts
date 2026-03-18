import { createHash, randomBytes, timingSafeEqual } from "crypto";
import prisma from "./prisma";
import logger from "./logger";

/**
 * 生成 ck- 前缀的 API Key
 */
export function generateApiKey(): string {
  return `ck-${randomBytes(32).toString("hex")}`;
}

export function hashApiKey(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

export function getApiKeyPreview(apiKey: string): string {
  if (apiKey.length <= 14) return `${apiKey.slice(0, 6)}••••`;
  return `${apiKey.slice(0, 8)}••••${apiKey.slice(-4)}`;
}

export function createApiKeyRecord() {
  const apiKey = generateApiKey();
  return {
    apiKey,
    apiKeyHash: hashApiKey(apiKey),
    apiKeyPreview: getApiKeyPreview(apiKey),
  };
}

function safeKeyPrefix(apiKey?: string | null): string | undefined {
  return apiKey ? apiKey.slice(0, 8) : undefined;
}

function apiKeysEqual(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left);
  const rightBuf = Buffer.from(right);
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

/**
 * 为用户创建或刷新 API Key
 */
export async function createApiKey(userId: string): Promise<string> {
  const keyRecord = createApiKeyRecord();
  logger.info("Creating API key for user", { userId });

  await prisma.user.update({
    where: { id: userId },
    data: {
      apiKey: null,
      apiKeyHash: keyRecord.apiKeyHash,
      apiKeyPreview: keyRecord.apiKeyPreview,
    },
  });

  logger.info("API key created", { userId, keyPrefix: safeKeyPrefix(keyRecord.apiKey) });
  return keyRecord.apiKey;
}

/**
 * 通过 API Key 验证并获取用户
 */
export async function validateApiKey(apiKey: string) {
  if (!apiKey || !apiKey.startsWith("ck-")) {
    logger.warn("Invalid API key format", { keyPrefix: safeKeyPrefix(apiKey) });
    return null;
  }

  const apiKeyHash = hashApiKey(apiKey);

  const user = await prisma.user.findUnique({
    where: { apiKeyHash },
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

  if (user) {
    logger.debug("API key validated", { userId: user.id });
    return user;
  }

  // 兼容历史明文 API key，并在验证成功后就地迁移到哈希存储。
  const legacyUser = await prisma.user.findUnique({
    where: { apiKey },
    select: {
      id: true,
      name: true,
      secondmeId: true,
      credits: true,
      accessToken: true,
      refreshToken: true,
      tokenExpiry: true,
      apiKey: true,
    },
  });

  if (legacyUser?.apiKey && apiKeysEqual(legacyUser.apiKey, apiKey)) {
    await prisma.user.update({
      where: { id: legacyUser.id },
      data: {
        apiKey: null,
        apiKeyHash,
        apiKeyPreview: getApiKeyPreview(apiKey),
      },
    });
    logger.info("Migrated legacy plaintext API key", { userId: legacyUser.id });
    logger.debug("API key validated", { userId: legacyUser.id });
    return {
      id: legacyUser.id,
      name: legacyUser.name,
      secondmeId: legacyUser.secondmeId,
      credits: legacyUser.credits,
      accessToken: legacyUser.accessToken,
      refreshToken: legacyUser.refreshToken,
      tokenExpiry: legacyUser.tokenExpiry,
    };
  }

  logger.warn("API key not found", { keyPrefix: safeKeyPrefix(apiKey) });
  return null;
}
