import logger from "./logger";
import { getService } from "./ai-providers";

const { url: EMBEDDING_URL, model: EMBEDDING_MODEL, apiKey: EMBEDDING_API_KEY } = getService("embedding");

/**
 * 通过 SiliconFlow 调用 Embedding 模型生成向量
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  logger.info("Generating embedding", { textLength: text.length, model: EMBEDDING_MODEL });

  const res = await fetch(EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!res.ok) {
    logger.error("Embedding generation failed", { status: res.status });
    throw new Error(`Embedding failed: ${res.status}`);
  }

  const data = await res.json();
  logger.debug("Embedding response structure", { keys: Object.keys(data), dataType: typeof data.data, dataLength: data.data?.length });

  if (!data.data || !Array.isArray(data.data) || data.data.length === 0) {
    logger.error("Unexpected embedding response shape", { hasData: !!data.data });
    throw new Error("Embedding response missing data array");
  }

  const embedding = data.data[0].embedding as number[];
  if (!embedding || !Array.isArray(embedding)) {
    logger.error("Unexpected embedding format");
    throw new Error("Embedding response missing embedding array");
  }

  logger.info("Embedding generated", { dimensions: embedding.length });
  return embedding;
}

/**
 * 将用户档案拼接为适合 Embedding 的文本
 */
export function buildProfileText(
  bio: string | null,
  shades: unknown,
  softmemory: unknown
): string {
  const parts: string[] = [];

  if (bio) parts.push(`简介: ${bio}`);

  if (Array.isArray(shades)) {
    const tags = shades.map((s: { name?: string }) => s.name || String(s)).join(", ");
    if (tags) parts.push(`兴趣标签: ${tags}`);
  }

  if (softmemory) {
    const memStr = typeof softmemory === "string" ? softmemory : JSON.stringify(softmemory);
    if (memStr.length > 0) parts.push(`知识库: ${memStr}`);
  }

  return parts.join("\n\n");
}
