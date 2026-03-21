import prisma from "./prisma";
import logger from "./logger";
import { generateEmbedding } from "./embedding";

export type MatchCandidate = {
  id: string;
  name: string;
  avatar: string | null;
  bio: string | null;
  secondmeId: string;
  similarity: number;
};

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
 * 统一搜索入口 — 先尝试向量搜索，失败自动 fallback 到 BM25 文本匹配
 */
export async function findMatchingUsers(
  query: string,
  excludeUserId: string,
  topN: number = 5
): Promise<MatchCandidate[]> {
  try {
    const queryEmbedding = await generateEmbedding(query);
    return await searchSimilarUsers(queryEmbedding, excludeUserId, topN);
  } catch (err) {
    logger.warn("Vector search failed, falling back to BM25", {
      error: (err as Error).message,
    });
    return await searchUsersBM25(query, excludeUserId, topN);
  }
}

/**
 * 向量相似度搜索 - 返回 Top N 最匹配的分身（排除自己）
 */
export async function searchSimilarUsers(
  queryEmbedding: number[],
  excludeUserId: string,
  topN: number = 5
): Promise<MatchCandidate[]> {
  const vectorStr = `[${queryEmbedding.join(",")}]`;
  logger.info("Searching similar users (vector)", { excludeUserId, topN });

  const results = await prisma.$queryRawUnsafe<MatchCandidate[]>(
    `SELECT id, name, avatar, bio, "secondmeId",
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

  logger.info("Vector search results", { count: results.length });
  return results;
}

/**
 * BM25 文本搜索 fallback — 使用 PostgreSQL ts_rank + plainto_tsquery
 * 匹配 name / bio / shades / softmemory 字段
 */
async function searchUsersBM25(
  query: string,
  excludeUserId: string,
  topN: number = 5
): Promise<MatchCandidate[]> {
  logger.info("Searching similar users (BM25 fallback)", { excludeUserId, topN, queryLength: query.length });

  // 用 ILIKE 做多关键词模糊匹配，兼容所有 PostgreSQL 版本
  // 将查询拆分为关键词，每个关键词都做 ILIKE 匹配
  const keywords = query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, 10); // 最多 10 个关键词

  if (keywords.length === 0) {
    // 无有效关键词，随机返回
    logger.info("No valid keywords, returning random users");
    return await prisma.$queryRawUnsafe<MatchCandidate[]>(
      `SELECT id, name, avatar, bio, "secondmeId", 0.5 as similarity
       FROM users
       WHERE id != $1 AND "secondmeId" IS NOT NULL
       ORDER BY random()
       LIMIT $2`,
      excludeUserId,
      topN
    );
  }

  // 构建查询：用 concat 拼接所有文本字段，对每个关键词计算匹配得分
  // 每命中一个关键词得 1 分，最终归一化为 0-1 的 similarity
  const likeConditions = keywords
    .map((_, i) => `(CASE WHEN combined ILIKE $${i + 3} THEN 1 ELSE 0 END)`)
    .join(" + ");

  const sql = `
    SELECT id, name, avatar, bio, "secondmeId",
           (${likeConditions})::float / ${keywords.length} as similarity
    FROM (
      SELECT id, name, avatar, bio, "secondmeId",
             COALESCE(name, '') || ' ' || COALESCE(bio, '') || ' ' ||
             COALESCE(shades::text, '') || ' ' || COALESCE(softmemory::text, '') as combined
      FROM users
      WHERE id != $1 AND "secondmeId" IS NOT NULL
    ) sub
    WHERE (${likeConditions}) > 0
    ORDER BY similarity DESC
    LIMIT $2
  `;

  const params: (string | number)[] = [excludeUserId, topN];
  for (const kw of keywords) {
    params.push(`%${kw}%`);
  }

  const results = await prisma.$queryRawUnsafe<MatchCandidate[]>(sql, ...params);

  // 如果 BM25 也没匹配到，随机返回一些用户
  if (results.length === 0) {
    logger.info("BM25 no matches, returning random users");
    return await prisma.$queryRawUnsafe<MatchCandidate[]>(
      `SELECT id, name, avatar, bio, "secondmeId", 0.1 as similarity
       FROM users
       WHERE id != $1 AND "secondmeId" IS NOT NULL
       ORDER BY random()
       LIMIT $2`,
      excludeUserId,
      topN
    );
  }

  logger.info("BM25 search results", { count: results.length });
  return results;
}
