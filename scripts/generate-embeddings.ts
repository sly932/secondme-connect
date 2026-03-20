/**
 * 为所有用户生成 embedding 向量并写入数据库
 * 同时导出用户信息 + embedding 到本地 JSON 文件，方便离线测试匹配效果
 *
 * 用法: npx tsx scripts/generate-embeddings.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import os from "os";
import path from "path";

const prisma = new PrismaClient();

const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small";

if (!OPENROUTER_API_KEY) {
  console.error("❌ OPENROUTER_API_KEY 未设置");
  process.exit(1);
}

interface UserRecord {
  id: string;
  name: string;
  bio: string | null;
  shades: unknown;
  softmemory: unknown;
  isNpc: boolean;
  profileText: string;
  embedding: number[];
}

function buildProfileText(bio: string | null, shades: unknown, softmemory: unknown): string {
  const parts: string[] = [];
  if (bio) parts.push(`简介: ${bio}`);
  if (Array.isArray(shades)) {
    const tags = shades.map((s: { name?: string }) => s.name || String(s)).join(", ");
    if (tags) parts.push(`兴趣标签: ${tags}`);
  }
  if (softmemory) {
    const memStr = typeof softmemory === "string" ? softmemory : JSON.stringify(softmemory);
    if (memStr.length > 0 && memStr !== "null") parts.push(`知识库: ${memStr}`);
  }
  return parts.join("\n\n");
}

async function generateEmbedding(text: string): Promise<number[]> {
  const { execSync } = await import("child_process");
  const tmpFile = path.join(os.tmpdir(), `embed-${Date.now()}.json`);
  const payload = JSON.stringify({ model: EMBEDDING_MODEL, input: text });
  fs.writeFileSync(tmpFile, payload);

  try {
    const result = execSync(
      `curl -s "${OPENROUTER_BASE_URL}/embeddings" ` +
      `-H "Content-Type: application/json" ` +
      `-H "Authorization: Bearer ${OPENROUTER_API_KEY}" ` +
      `-d @${tmpFile}`,
      { encoding: "utf-8", timeout: 30000 }
    );

    const data = JSON.parse(result);
    if (!data.data || !Array.isArray(data.data) || !data.data[0]?.embedding) {
      console.error("  ⚠️ 异常响应:", result.slice(0, 300));
      throw new Error(`Embedding 响应格式异常`);
    }
    return data.data[0].embedding as number[];
  } finally {
    fs.unlinkSync(tmpFile);
  }
}

async function saveEmbeddingToDb(userId: string, embedding: number[]) {
  const vectorStr = `[${embedding.join(",")}]`;
  // 每次用新的 PrismaClient 避免 PgBouncer prepared statement 冲突
  const { PrismaClient } = await import("@prisma/client");
  const tempPrisma = new PrismaClient();
  try {
    await tempPrisma.$executeRawUnsafe(
      `UPDATE users SET embedding = $1::vector WHERE id = $2`,
      vectorStr,
      userId
    );
  } finally {
    await tempPrisma.$disconnect();
  }
}

async function main() {
  console.log("📊 获取所有用户...");

  // 只处理没有 embedding 的用户
  const allUsers = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      bio: true,
      shades: true,
      softmemory: true,
      isNpc: true,
    },
  });

  const usersWithEmbedding = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM users WHERE embedding IS NOT NULL`
  );
  const hasEmbeddingSet = new Set(usersWithEmbedding.map((u) => u.id));
  const users = allUsers.filter((u) => !hasEmbeddingSet.has(u.id));
  console.log(`其中 ${hasEmbeddingSet.size} 个已有 embedding，本次处理 ${users.length} 个\n`);

  console.log(`共 ${users.length} 个用户\n`);

  const results: UserRecord[] = [];
  let success = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    const profileText = buildProfileText(user.bio, user.shades, user.softmemory);

    if (!profileText.trim()) {
      console.log(`⏭️  [${user.name}] 无档案信息，跳过`);
      skipped++;
      continue;
    }

    try {
      console.log(`🔄 [${user.name}] 生成 embedding (${profileText.length} 字)...`);
      const embedding = await generateEmbedding(profileText);

      // 写入数据库
      await saveEmbeddingToDb(user.id, embedding);
      console.log(`✅ [${user.name}] 已写入数据库 (${embedding.length} 维)`);

      results.push({
        id: user.id,
        name: user.name,
        bio: user.bio,
        shades: user.shades,
        softmemory: user.softmemory,
        isNpc: user.isNpc,
        profileText,
        embedding,
      });

      success++;

      // 限速：避免 OpenRouter rate limit
      await new Promise((r) => setTimeout(r, 200));
    } catch (err) {
      console.error(`❌ [${user.name}] 失败: ${(err as Error).message}`);
      failed++;
    }
  }

  // 合并已有数据 + 新数据，导出到本地 JSON
  const outDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "user-embeddings.json");
  let existing: UserRecord[] = [];
  if (fs.existsSync(outPath)) {
    try { existing = JSON.parse(fs.readFileSync(outPath, "utf-8")); } catch { /* ignore */ }
  }
  const merged = [...existing.filter((e) => !results.find((r) => r.id === e.id)), ...results];
  fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));

  // 导出一份不含 embedding 的轻量版（方便查看）
  const summaryPath = path.join(outDir, "user-profiles.json");
  const summary = merged.map((r) => ({
    id: r.id,
    name: r.name,
    bio: r.bio,
    isNpc: r.isNpc,
    profileText: r.profileText,
    embeddingDimensions: r.embedding.length,
  }));
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`\n========== 完成 ==========`);
  console.log(`✅ 成功: ${success}`);
  console.log(`⏭️  跳过: ${skipped}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`\n📁 完整数据: ${outPath}`);
  console.log(`📁 用户摘要: ${summaryPath}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("脚本异常:", err);
  prisma.$disconnect();
  process.exit(1);
});
