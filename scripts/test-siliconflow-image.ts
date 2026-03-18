/**
 * 测试 SiliconFlow 图片生成 API
 *
 * npx tsx scripts/test-siliconflow-image.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import fs from "fs";
import path from "path";

const API_KEY = process.env.SILICONFLOW_API_KEY;
const IMAGE_URL =
  process.env.SILICONFLOW_IMAGE_URL ||
  "https://api.siliconflow.cn/v1/images/generations";
const IMAGE_MODEL =
  process.env.SILICONFLOW_IMAGE_MODEL || "Kwai-Kolors/Kolors";

async function main() {
  if (!API_KEY) {
    console.error("❌ SILICONFLOW_API_KEY 未设置");
    process.exit(1);
  }

  const prompt =
    "A magical forest at sunset, golden light filtering through ancient trees, fireflies glowing softly, a small crystal-clear stream running through moss-covered rocks, fantasy art style";

  console.log(`🎨 模型: ${IMAGE_MODEL}`);
  console.log(`📝 Prompt: ${prompt}`);
  console.log(`⏳ 生成中...`);

  const start = Date.now();

  const res = await fetch(IMAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      prompt,
      image_size: "1024x768",
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ API 错误 (${res.status}): ${errorText}`);
    process.exit(1);
  }

  const data = await res.json();
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`✅ 生成完成 (${elapsed}s)`);

  const imageUrl = data?.images?.[0]?.url;
  if (!imageUrl) {
    console.error("❌ 响应中没有图片 URL:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log(`🔗 图片 URL: ${imageUrl}`);
  if (data.seed) console.log(`🌱 Seed: ${data.seed}`);
  if (data.timings?.inference)
    console.log(`⏱️  推理耗时: ${data.timings.inference.toFixed(2)}s`);

  // 下载图片到本地
  console.log(`📥 下载中...`);
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    console.error(`❌ 下载失败 (${imgRes.status})`);
    process.exit(1);
  }

  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const outDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, `test-kolors-${Date.now()}.png`);
  fs.writeFileSync(outPath, buffer);
  console.log(`💾 已保存: ${outPath} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error("❌ 未知错误:", err);
  process.exit(1);
});
