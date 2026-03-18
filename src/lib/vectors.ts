import prisma from "./prisma";
import logger from "./logger";

/**
 * 保存用户向量到数据库
 */
export async function saveUserEmbedding(userId: string, embedding: number[]) {
  const vectorStr = `[${embedding.join(",")}]`;
  logger.info("Saving user embedding", { userId, dimensions: embedding.length });

  await prisma.$executeRawUnsafe(
    `UPDATE users SET embedding = $1::vector WHERE id = $2`,
    vectorStr,
    userId
  );

  logger.info("User embedding saved", { userId });
}

/**
 * 向量相似度搜索 - 返回 Top N 最匹配的分身（排除自己）
 */
export async function searchSimilarUsers(
  queryEmbedding: number[],
  excludeUserId: string,
  topN: number = 10
) {
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  logger.info("Searching similar users", { excludeUserId, topN });

  const results = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      name: string;
      avatar: string | null;
      bio: string | null;
      secondme_id: string;
      similarity: number;
    }>
  >(
    `SELECT id, name, avatar, bio, secondme_id,
            1 - (embedding <=> $1::vector) as similarity
     FROM users
     WHERE id != $2
       AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    vectorStr,
    excludeUserId,
    topN
  );

  logger.info("Similar users found", { count: results.length });
  return results;
}
