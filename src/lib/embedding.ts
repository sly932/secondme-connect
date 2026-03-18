import logger from "./logger";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openai/text-embedding-3-small";

/**
 * 通过 OpenRouter 调用 Embedding 模型生成向量
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const baseUrl = process.env.OPENROUTER_BASE_URL || DEFAULT_BASE_URL;
  const model = process.env.EMBEDDING_MODEL || DEFAULT_MODEL;

  logger.info("Generating embedding", { textLength: text.length, model });

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model,
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
