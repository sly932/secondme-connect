#!/usr/bin/env node
/**
 * 用南瓜的档案测试 7 种像素画风格
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, "style-test");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const ACCESS_TOKEN =
  "lba_at_9889b2a245125368868b5d050df8c27c562dbb7176bb1c8d3355a7b629ad20ff";
const SECONDME_CHAT_URL =
  "https://api.mindverse.com/gate/lab/api/secondme/chat/stream";
const SILICONFLOW_URL = "https://api.siliconflow.cn/v1/images/generations";
const SILICONFLOW_KEY = "sk-bobcetbxglmfupyagbdzcwknbakuxqbmfkhmokmzvaweekpd";
const SILICONFLOW_MODEL = "Kwai-Kolors/Kolors";

// 南瓜的档案
const PROFILE = {
  name: "南瓜",
  secondmeId: "m0x600",
  mbti: "ISFP",
  identity: "新媒体运营人员",
  personality: "感性、独立、注重体验、温柔细腻、不喜拘束",
  values: "个人感受和体验、自由和独立、和谐人际关系",
  interests: "新媒体, 创意内容",
  summary: "温柔细腻又独立自主的新媒体运营，注重个人感受和体验，在工作中发挥创造力和审美。",
};

const USER_INFO = Object.entries(PROFILE)
  .filter(([k, v]) => v && k !== "secondmeId")
  .map(([k, v]) => `${k}: ${v}`)
  .join("\n");

// 7 种风格
const STYLES = [
  {
    key: "stardew-valley",
    label: "星露谷风格",
    desc: `Stardew Valley style pixel art — warm pastoral aesthetic, soft rounded pixel edges, cozy countryside palette with greens/browns/pastels, simple but expressive character sprites, sunny outdoor or cottage interior setting, small farming/nature details like crops, flowers, wooden furniture. Bright golden sunlight, cheerful and wholesome mood.`,
  },
  {
    key: "cute-cartoon",
    label: "可爱卡通风格",
    desc: `Cute cartoon pixel art — round bubbly shapes, exaggerated cute proportions (big eyes, small mouth), candy-colored bright palette (pink, sky blue, mint, yellow), sparkles and small decorative elements (stars, hearts, bubbles), smooth shading, playful and joyful atmosphere, kawaii aesthetic.`,
  },
  {
    key: "japanese-pixel",
    label: "日系像素",
    desc: `Japanese pixel art (ドット絵) — influenced by classic JRPG and visual novel art, delicate and detailed pixel work, anime-inspired character features, soft gradients, cherry blossom / Japanese urban elements in background, warm ambient lighting, clean composition, 16-bit era SNES/GBA aesthetic with modern polish.`,
  },
  {
    key: "hand-drawn-pixel",
    label: "手绘融合像素风",
    desc: `Hand-drawn hybrid pixel art — combines watercolor/sketch textures with pixel art structure, visible brushstroke-like pixel clusters, warm organic color palette, slightly imperfect edges giving a handmade feel, cozy illustration vibe mixed with retro pixel aesthetic, soft lighting with painted glow effects.`,
  },
  {
    key: "isometric",
    label: "等距像素风",
    desc: `Isometric pixel art — 45-degree top-down angle, clean geometric perspective, detailed miniature scene like a diorama or tiny room, crisp edges, vibrant colors, the character sits/stands inside a fully decorated isometric room showing their personality through furniture and objects, bright daylight streaming in.`,
  },
  {
    key: "ghibli-pixel",
    label: "吉卜力像素风",
    desc: `Studio Ghibli inspired pixel art — dreamy and whimsical atmosphere, lush natural scenery (green hills, fluffy clouds, gentle breeze), soft warm color palette with earthy tones and sky blues, magical realism details (floating particles, gentle light rays), the character has a gentle serene expression, nostalgic and peaceful mood, Miyazaki-esque wonder.`,
  },
  {
    key: "chibi-pixel",
    label: "Chibi 像素风",
    desc: `Chibi pixel art — super-deformed proportions (oversized head ~1:1 with body), tiny stubby limbs, extremely cute and expressive face with big shiny eyes, bold bright colors, simple but charming background with iconic items representing personality, bouncy energetic pose, fun and adorable mood, clean crisp pixels.`,
  },
];

// --- 工具函数 ---

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

async function getChatPrompt(style) {
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
${USER_INFO}
--- End ---

Generate a vivid, bright portrait prompt for this person.`;

  const res = await fetch(SECONDME_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      target_user_id: PROFILE.secondmeId,
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

// --- 主流程 ---

async function main() {
  console.log(`\n=== 南瓜 x 7 种风格测试 ===\n`);

  for (let i = 0; i < STYLES.length; i++) {
    const style = STYLES[i];
    const tag = `[${i + 1}/${STYLES.length}] ${style.label}`;
    const imgPath = path.join(OUTPUT_DIR, `${style.key}.png`);
    const txtPath = path.join(OUTPUT_DIR, `${style.key}.txt`);

    try {
      console.log(`${tag} — 获取 prompt...`);
      const prompt = await getChatPrompt(style);
      fs.writeFileSync(txtPath, prompt);
      console.log(`${tag} — Prompt: ${prompt.slice(0, 90)}...`);

      console.log(`${tag} — 生成图片...`);
      const url = await generateImage(prompt);
      await downloadImage(url, imgPath);
      console.log(`${tag} — 完成!\n`);
    } catch (err) {
      console.error(`${tag} — 失败: ${err.message}\n`);
    }

    if (i < STYLES.length - 1) await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`所有风格测试完成! 输出目录: ${OUTPUT_DIR}`);
}

main().catch(console.error);
