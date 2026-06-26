/**
 * 批量生成自画像脚本
 * 用法: npx tsx --env-file=.env.local --env-file=.env scripts/batch-portrait.ts
 */
import { PrismaClient } from "@prisma/client";
import { chatStream } from "../src/lib/secondme";
import { uploadPortrait } from "../src/lib/storage";
import { getService } from "../src/lib/ai-providers";

// 用 DIRECT_URL 直连数据库，避免 PgBouncer prepared statement 冲突
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL } },
});
const { url: SILICONFLOW_URL, model: SILICONFLOW_MODEL, apiKey: SILICONFLOW_KEY } = getService("portrait");

function buildSystemPrompt(name: string, bio?: string | null, shades?: unknown): string {
  const profileLines: string[] = [];
  if (name) profileLines.push(`- 姓名: ${name}`);
  if (bio) profileLines.push(`- 简介: ${bio}`);
  if (shades) {
    const list = Array.isArray(shades) ? shades : [];
    if (list.length > 0) profileLines.push(`- 兴趣标签: ${list.join("、")}`);
  }
  return [
    `## 你的身份档案`,
    profileLines.length > 0 ? profileLines.join("\n") : "（未提供）",
    ``,
    `## 风格要求`,
    `- 明亮、充满活力的色调，禁止阴暗色调`,
    `- 像素风（pixel art）、16-bit 美学、干净利落的边缘`,
    `- 温暖友好的氛围，良好的光照`,
    `- 角色表情生动亲切`,
    `- 背景应体现人物的兴趣和个性`,
    ``,
    `## 交流要求`,
    `- 请以这个人的性格、语气和思维方式来回应`,
    `- 根据你的实际经验和职业经历来创作`,
    ``,
    `## 输出格式`,
    `- 只输出英文绘画提示词本身，200 词以内`,
    `- 不要包含任何解释、前缀、标点引号或其他多余内容`,
  ].join("\n");
}

async function parseSSE(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
      try {
        const json = JSON.parse(line.slice(6));
        const content = json.choices?.[0]?.delta?.content;
        if (content) result += content;
      } catch {}
    }
  }
  return result;
}

async function generateImage(prompt: string): Promise<string> {
  const res = await fetch(SILICONFLOW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SILICONFLOW_KEY}` },
    body: JSON.stringify({ model: SILICONFLOW_MODEL, prompt, image_size: "1024x1024", num_inference_steps: 50 }),
  });
  if (!res.ok) throw new Error(`Image API error: ${res.status}`);
  const data = await res.json();
  return data.images?.[0]?.url || data.data?.[0]?.url || (() => { throw new Error("No image URL"); })();
}

async function generateOne(user: { id: string; name: string; secondmeId: string; accessToken: string; bio: string | null; shades: unknown }) {
  const systemPrompt = buildSystemPrompt(user.name, user.bio, user.shades);
  const message = `你是${user.name}，请根据你对自己的认知，完成你的像素风自画像提示词。`;

  const stream = await chatStream(user.accessToken, user.secondmeId, message, systemPrompt);
  const prompt = (await parseSSE(stream)).trim();
  if (!prompt || prompt.length < 20) throw new Error("Prompt too short");

  const tempUrl = await generateImage(prompt);
  const permanentUrl = await uploadPortrait(user.id, tempUrl);

  await prisma.user.update({
    where: { id: user.id },
    data: { portraitUrl: permanentUrl, portraitPrompt: prompt },
  });

  return permanentUrl;
}

async function main() {
  // 支持通过命令行参数指定用户 ID: npx tsx scripts/batch-portrait.ts id1 id2 ...
  const targetIds = process.argv.slice(2);

  const users = await prisma.user.findMany({
    where: {
      accessToken: { not: "" },
      secondmeId: { not: "" },
      ...(targetIds.length > 0
        ? { id: { in: targetIds } }
        : { OR: [{ portraitUrl: null }, { isNpc: true }] }),
    },
    select: { id: true, name: true, secondmeId: true, accessToken: true, bio: true, shades: true },
  });

  console.log(`找到 ${users.length} 个需要生成自画像的用户\n`);

  let success = 0;
  let failed = 0;
  let index = 0;
  const CONCURRENCY = 10;

  async function worker() {
    while (index < users.length) {
      const i = index++;
      const user = users[i];
      const label = `[${i + 1}/${users.length}] ${user.name} (${user.id})`;
      try {
        console.log(`⏳ ${label} 开始生成...`);
        const url = await generateOne(user);
        console.log(`✅ ${label} 完成 → ${url.substring(0, 80)}...`);
        success++;
      } catch (err) {
        console.error(`❌ ${label} 失败: ${(err as Error).message}`);
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log(`\n===== 完成 =====`);
  console.log(`成功: ${success}, 失败: ${failed}, 总计: ${users.length}`);
  await prisma.$disconnect();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
