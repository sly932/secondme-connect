#!/usr/bin/env node
/**
 * 用 cute-cartoon 和 hand-drawn 两种风格，跑 5 个用户档案
 * 图片放 portraits/，prompt 放 portraits/prompts/
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORTRAITS_DIR = path.join(__dirname, "portraits");
const PROMPTS_DIR = path.join(PORTRAITS_DIR, "prompts");
fs.mkdirSync(PROMPTS_DIR, { recursive: true });

const ACCESS_TOKEN =
  "lba_at_9889b2a245125368868b5d050df8c27c562dbb7176bb1c8d3355a7b629ad20ff";
const SECONDME_CHAT_URL =
  "https://api.mindverse.com/gate/lab/api/secondme/chat/stream";
const SILICONFLOW_URL = "https://api.siliconflow.cn/v1/images/generations";
const SILICONFLOW_KEY = "sk-bobcetbxglmfupyagbdzcwknbakuxqbmfkhmokmzvaweekpd";
const SILICONFLOW_MODEL = "Kwai-Kolors/Kolors";

const PROFILES = JSON.parse(
  fs.readFileSync(path.join(__dirname, "profiles.json"), "utf-8")
);

// 选 5 个档案
const SELECTED = ["pumpkin", "沈浪", "TANG", "Kristen", "Alen"];
const USERS = PROFILES.filter((p) => SELECTED.includes(p.name));

const STYLES = [
  {
    key: "cute-cartoon",
    desc: `Cute cartoon pixel art — round bubbly shapes, exaggerated cute proportions (big eyes, small mouth), candy-colored bright palette (pink, sky blue, mint, yellow), sparkles and small decorative elements (stars, hearts, bubbles), smooth shading, playful and joyful atmosphere, kawaii aesthetic.`,
  },
  {
    key: "hand-drawn",
    desc: `Hand-drawn hybrid pixel art — combines watercolor/sketch textures with pixel art structure, visible brushstroke-like pixel clusters, warm organic color palette, slightly imperfect edges giving a handmade feel, cozy illustration vibe mixed with retro pixel aesthetic, soft lighting with painted glow effects.`,
  },
];

function buildUserInfo(profile) {
  const fields = ["name", "mbti", "identity", "personality", "values", "interests", "summary"];
  return fields
    .filter((k) => {
      const v = profile[k];
      if (v == null) return false;
      if (Array.isArray(v)) return v.length > 0;
      return String(v).trim() !== "";
    })
    .map((k) => {
      const v = profile[k];
      return `${k}: ${Array.isArray(v) ? v.join(", ") : v}`;
    })
    .join("\n");
}

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

async function getChatPrompt(profile, style) {
  const systemPrompt = `You are a creative prompt engineer for pixel art portrait generation.

Art style (MUST follow strictly):
${style.desc}

Color & mood requirements:
- Bright, vibrant, and energetic color palette — NO dark/gloomy tones
- Warm and inviting atmosphere with good lighting
- The character should look lively and approachable
- Overall mood: positive, warm, full of life

Output rules:
- Output ONLY the English image generation prompt, nothing else
- No prefix, no explanation, no markdown
- Keep it under 200 words
- Must be directly usable as a text-to-image prompt`;

  const message = `Based on the following user profile, write a portrait prompt in the specified pixel art style.

--- User Profile ---
${buildUserInfo(profile)}
--- End ---

Generate a vivid, bright portrait prompt for this person.`;

  const res = await fetch(SECONDME_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      target_user_id: profile.secondmeId,
      message,
      systemPrompt,
    }),
  });
  if (!res.ok) throw new Error(`Chat API error: ${res.status}`);
  return parseSSEStream(res);
}

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
  if (!res.ok) throw new Error(`Image API error: ${res.status}`);
  const data = await res.json();
  return data.images?.[0]?.url || data.data?.[0]?.url;
}

async function downloadImage(url, filepath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  fs.writeFileSync(filepath, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  const tasks = [];
  for (const user of USERS) {
    for (const style of STYLES) {
      tasks.push({ user, style });
    }
  }

  console.log(`\n=== 2 风格 x 5 用户 = ${tasks.length} 张 ===\n`);

  for (let i = 0; i < tasks.length; i++) {
    const { user, style } = tasks[i];
    const filename = `${user.name}_${style.key}`;
    const tag = `[${i + 1}/${tasks.length}] ${user.name} - ${style.key}`;
    const imgPath = path.join(PORTRAITS_DIR, `${filename}.png`);
    const txtPath = path.join(PROMPTS_DIR, `${filename}.txt`);

    if (fs.existsSync(imgPath)) {
      console.log(`${tag} — 已存在，跳过`);
      continue;
    }

    try {
      console.log(`${tag} — 获取 prompt...`);
      const prompt = await getChatPrompt(user, style);
      fs.writeFileSync(txtPath, prompt);
      console.log(`${tag} — Prompt: ${prompt.slice(0, 90)}...`);

      console.log(`${tag} — 生成图片...`);
      const url = await generateImage(prompt);
      await downloadImage(url, imgPath);
      console.log(`${tag} — 完成!\n`);
    } catch (err) {
      console.error(`${tag} — 失败: ${err.message}\n`);
    }

    if (i < tasks.length - 1) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`完成! 图片: ${PORTRAITS_DIR}  Prompt: ${PROMPTS_DIR}`);
}

main().catch(console.error);
