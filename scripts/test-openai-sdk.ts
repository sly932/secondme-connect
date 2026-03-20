/**
 * 测试用 OpenAI SDK 通过 OpenRouter 调 embedding
 *
 * npx tsx scripts/test-openai-sdk.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import OpenAI from "openai";
import { Agent } from "https";

// 用自定义 Agent 绕过系统代理
const directAgent = new Agent({ keepAlive: true });

const client = new OpenAI({
  baseURL: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  httpAgent: directAgent,
});

async function main() {
  // 测试 1: 英文
  console.log("测试 1: 英文文本...");
  const res1 = await client.embeddings.create({
    model: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
    input: "Hello, how are you?",
  });
  console.log(`  ✅ 英文成功，维度: ${res1.data[0].embedding.length}\n`);

  // 测试 2: 中文
  console.log("测试 2: 中文文本...");
  const res2 = await client.embeddings.create({
    model: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
    input: "我想了解如何做产品推广，需要一个营销专家的建议",
  });
  console.log(`  ✅ 中文成功，维度: ${res2.data[0].embedding.length}\n`);

  // 测试 3: NPC 档案
  console.log("测试 3: NPC 档案文本...");
  const res3 = await client.embeddings.create({
    model: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
    input: "简介: 中国现代文学奠基人，《狂人日记》《阿Q正传》，犀利批判性思维",
  });
  console.log(`  ✅ NPC 档案成功，维度: ${res3.data[0].embedding.length}\n`);

  // 测试 4: 相似度
  console.log("测试 4: 相似度验证...");
  const [marketing, tech] = await Promise.all([
    client.embeddings.create({
      model: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
      input: "产品推广和营销策略",
    }),
    client.embeddings.create({
      model: process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
      input: "量子物理和相对论",
    }),
  ]);

  const a = marketing.data[0].embedding;
  const b = tech.data[0].embedding;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
  console.log(`  "产品推广和营销策略" vs "量子物理和相对论" 相似度: ${(similarity * 100).toFixed(1)}%`);
  console.log(`  （预期较低，说明区分度正常）\n`);

  console.log("🎉 全部测试通过！");
}

main().catch((err) => {
  console.error("❌ 测试失败:", err.message);
  process.exit(1);
});
