#!/usr/bin/env node
/**
 * 批量生成真实用户的像素风自画像
 * 1. 读取 profiles.json 用户档案
 * 2. 调用 SecondMe Chat API（带 systemPrompt 风格约束 + 结构化用户信息）
 * 3. 调用 SiliconFlow 图片生成 API
 * 4. 下载保存到 test/test-portal/portraits/
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTRAITS_DIR = path.join(__dirname, "portraits");
fs.mkdirSync(PORTRAITS_DIR, { recursive: true });

// --- 配置 ---
const ACCESS_TOKEN =
  "lba_at_9889b2a245125368868b5d050df8c27c562dbb7176bb1c8d3355a7b629ad20ff";
const SECONDME_CHAT_URL =
  "https://api.mindverse.com/gate/lab/api/secondme/chat/stream";
const SILICONFLOW_URL = "https://api.siliconflow.cn/v1/images/generations";
const SILICONFLOW_KEY = "sk-bobcetbxglmfupyagbdzcwknbakuxqbmfkhmokmzvaweekpd";
const SILICONFLOW_MODEL = "Kwai-Kolors/Kolors";

// 从 profiles.json 读取用户数据
const PROFILES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "profiles.json"), "utf-8")
);

// --- System Prompt: 风格约束 ---
const SYSTEM_PROMPT = `You are a creative prompt engineer for pixel art portrait generation.

Style requirements (MUST follow):
- Bright, vibrant, and energetic color palette — NO dark/gloomy tones
- Clean pixel art style, 16-bit aesthetic, crisp edges
- Warm and inviting atmosphere with good lighting (daylight, golden hour, or cozy indoor light)
- The character should look lively and approachable, with a natural expression (smile, confident look, etc.)
- Background should reflect the person's interests and personality, with rich but not cluttered details
- Overall mood: positive, warm, full of life

Output rules:
- Output ONLY the English image generation prompt, nothing else
- No prefix, no explanation, no markdown
- Keep it under 200 words
- Must be directly usable as a text-to-image prompt`;

// --- 工具函数 ---

/** 把 profile 对象拼接成结构化文本，只包含有值的字段 */
function buildUserInfoText(profile) {
  const fieldMap = [
    ["name", "name"],
    ["mbti", "mbti"],
    ["identity", "identity"],
    ["personality", "personality"],
    ["values", "values"],
    ["interests", "interests"],
    ["summary", "summary"],
  ];

  const lines = [];
  for (const [key, label] of fieldMap) {
    const val = profile[key];
    if (val == null) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === "string" && val.trim() === "") continue;
    const display = Array.isArray(val) ? val.join(", ") : val;
    lines.push(`${label}: ${display}`);
  }
  return lines.join("\n");
}

/** 解析 SSE 流，提取完整文本 */
async function parseSSEStream(response) {
  const text = await response.text();
  let result = "";
  for (const line of text.split("\n")) {
    if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
    try {
      const json = JSON.parse(line.slice(6));
      const content = json.choices?.[0]?.delta?.content;
      if (content) result += content;
    } catch {}
  }
  return result;
}

/** 调用 SecondMe Chat API 获取像素风自画像描述 */
async function getChatPortraitPrompt(profile) {
  const userInfo = buildUserInfoText(profile);
  const message = `Based on the following user profile, write a pixel art self-portrait prompt for AI image generation.

--- User Profile ---
${userInfo}
--- End ---

Generate a vivid, bright, and energetic pixel art portrait prompt for this person.`;

  const res = await fetch(SECONDME_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      target_user_id: profile.secondmeId,
      message,
      systemPrompt: SYSTEM_PROMPT,
    }),
  });

  if (!res.ok) {
    throw new Error(`Chat API error: ${res.status} ${await res.text()}`);
  }
  return parseSSEStream(res);
}

/** 调用 SiliconFlow 生成图片，返回图片 URL */
async function generateImage(prompt) {
  const res = await fetch(SILICONFLOW_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SILICONFLOW_KEY}`,
    },
    body: JSON.stringify({
      model: SILICONFLOW_MODEL,
      prompt,
      image_size: "1024x1024",
      num_inference_steps: 50,
    }),
  });

  if (!res.ok) {
    throw new Error(`Image API error: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.images?.[0]?.url || data.data?.[0]?.url;
}

/** 下载图片到本地 */
async function downloadImage(url, filepath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filepath, buffer);
}

// --- 主流程 ---

async function processUser(profile, index, total) {
  const tag = `[${index + 1}/${total}] ${profile.name}`;
  const imgPath = path.join(PORTRAITS_DIR, `${profile.name}.png`);
  const promptPath = path.join(PORTRAITS_DIR, `${profile.name}.txt`);

  // 跳过已生成的
  if (fs.existsSync(imgPath)) {
    console.log(`${tag} - 已存在，跳过`);
    return { name: profile.name, status: "skipped" };
  }

  try {
    // Step 1: 获取描述
    console.log(`${tag} - 获取自画像描述...`);
    const prompt = await getChatPortraitPrompt(profile);
    if (!prompt || prompt.length < 20) {
      throw new Error(`Prompt too short: "${prompt}"`);
    }
    fs.writeFileSync(promptPath, prompt);
    console.log(`${tag} - Prompt (${prompt.length} chars): ${prompt.slice(0, 100)}...`);

    // Step 2: 生成图片
    console.log(`${tag} - 生成图片...`);
    const imageUrl = await generateImage(prompt);
    if (!imageUrl) throw new Error("No image URL returned");

    // Step 3: 下载图片
    console.log(`${tag} - 下载图片...`);
    await downloadImage(imageUrl, imgPath);
    console.log(`${tag} - 完成! -> ${imgPath}`);

    return { name: profile.name, status: "ok", prompt: prompt.slice(0, 100) };
  } catch (err) {
    console.error(`${tag} - 失败: ${err.message}`);
    return { name: profile.name, status: "error", error: err.message };
  }
}

async function main() {
  console.log(`\n=== 批量生成像素风自画像 ===`);
  console.log(`用户数: ${PROFILES.length}`);
  console.log(`输出目录: ${PORTRAITS_DIR}\n`);

  const results = [];

  for (let i = 0; i < PROFILES.length; i++) {
    const result = await processUser(PROFILES[i], i, PROFILES.length);
    results.push(result);

    if (i < PROFILES.length - 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // 汇总
  console.log("\n=== 汇总 ===");
  const ok = results.filter((r) => r.status === "ok").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const errors = results.filter((r) => r.status === "error");
  console.log(`成功: ${ok}  跳过: ${skipped}  失败: ${errors.length}`);
  if (errors.length > 0) {
    console.log("失败详情:");
    errors.forEach((e) => console.log(`  - ${e.name}: ${e.error}`));
  }

  const summaryPath = path.join(PORTRAITS_DIR, "_summary.json");
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
  console.log(`\n结果已保存: ${summaryPath}`);
}

main().catch(console.error);
