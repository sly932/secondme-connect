/**
 * 本地测试 embedding 匹配效果（不需要启动服务器或连数据库）
 *
 * 用法:
 *   npx tsx scripts/test-match.ts "我想了解如何做产品推广"
 *   npx tsx scripts/test-match.ts "帮我画一幅油画风格的头像"
 *   npx tsx scripts/test-match.ts --user 鲁迅      # 查看与某用户最匹配的人
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import fs from "fs";
import os from "os";
import path from "path";

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small";

interface UserRecord {
  id: string;
  name: string;
  bio: string | null;
  isNpc: boolean;
  profileText: string;
  embedding: number[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function generateEmbedding(text: string): Promise<number[]> {
  const { execSync } = await import("child_process");
  const tmpFile = path.join(os.tmpdir(), `embed-q-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, JSON.stringify({ model: EMBEDDING_MODEL, input: text }));

  try {
    const result = execSync(
      `curl -s "${OPENROUTER_BASE_URL}/embeddings" ` +
      `-H "Content-Type: application/json" ` +
      `-H "Authorization: Bearer ${OPENROUTER_API_KEY}" ` +
      `-d @${tmpFile}`,
      { encoding: "utf-8", timeout: 30000 }
    );
    const data = JSON.parse(result);
    if (!data.data?.[0]?.embedding) throw new Error(`响应异常: ${result.slice(0, 200)}`);
    return data.data[0].embedding as number[];
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

function loadUsers(): UserRecord[] {
  const filePath = path.join(process.cwd(), "data", "user-embeddings.json");
  if (!fs.existsSync(filePath)) {
    console.error("❌ 数据文件不存在，请先运行: npx tsx scripts/generate-embeddings.ts");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function rankByQuery(users: UserRecord[], queryEmbedding: number[], topN = 10) {
  return users
    .map((u) => ({ ...u, similarity: cosineSimilarity(queryEmbedding, u.embedding) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topN);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("用法:");
    console.log('  npx tsx scripts/test-match.ts "我想了解如何做产品推广"');
    console.log("  npx tsx scripts/test-match.ts --user 鲁迅");
    process.exit(0);
  }

  const users = loadUsers();
  console.log(`📊 已加载 ${users.length} 个用户向量\n`);

  if (args[0] === "--user") {
    // 用户间匹配
    const targetName = args.slice(1).join(" ");
    const target = users.find((u) => u.name === targetName);
    if (!target) {
      console.error(`❌ 找不到用户: ${targetName}`);
      console.log("可用用户:", users.map((u) => u.name).join(", "));
      process.exit(1);
    }

    console.log(`🔍 与「${target.name}」最匹配的用户:\n`);
    console.log(`  档案: ${target.bio || "(无)"}\n`);

    const others = users.filter((u) => u.id !== target.id);
    const ranked = rankByQuery(others, target.embedding);

    ranked.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name} — ${(r.similarity * 100).toFixed(1)}% 匹配`);
      console.log(`     ${r.bio || "(无简介)"}\n`);
    });
  } else {
    // 自由文本查询
    const query = args.join(" ");
    console.log(`🔍 查询: "${query}"\n`);

    if (!OPENROUTER_API_KEY) {
      console.error("❌ OPENROUTER_API_KEY 未设置");
      process.exit(1);
    }

    console.log("⏳ 生成查询向量...");
    const queryEmbedding = await generateEmbedding(query);
    console.log(`✅ 向量维度: ${queryEmbedding.length}\n`);

    const ranked = rankByQuery(users, queryEmbedding);

    console.log("📋 匹配结果:\n");
    ranked.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.name} — ${(r.similarity * 100).toFixed(1)}% 匹配`);
      console.log(`     ${r.bio || "(无简介)"}\n`);
    });
  }
}

main().catch((err) => {
  console.error("脚本异常:", err);
  process.exit(1);
});
