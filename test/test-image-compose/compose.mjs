/**
 * 多图合成测试脚本
 * 使用 OpenRouter GPT-4o 将多张角色图合成为一张互动场景图
 *
 * 用法: node compose.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

if (!OPENROUTER_API_KEY) {
  console.error('❌ 请在 .env.local 中设置 OPENROUTER_API_KEY');
  process.exit(1);
}

// 前三张头像
const PORTRAITS_DIR = path.resolve(__dirname, '../test-portal/portraits');
const IMAGE_FILES = ['Ai摸鱼研究员.png', 'Alen.png', 'Imxiaoguan.png'];

function imageToBase64(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
}

async function generateComposite(style, prompt) {
  const imageContents = IMAGE_FILES.map((name) => {
    const filePath = path.join(PORTRAITS_DIR, name);
    const b64 = imageToBase64(filePath);
    return {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${b64}` },
    };
  });

  const messages = [
    {
      role: 'user',
      content: [
        ...imageContents,
        {
          type: 'text',
          text: prompt,
        },
      ],
    },
  ];

  console.log(`\n🎨 正在生成 [${style}] 风格的合成图...`);

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'sm-connect image compose test',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API 请求失败 (${res.status}): ${errText}`);
  }

  const data = await res.json();

  // GPT-4o 图片生成结果可能在 choices[0].message.content 中
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('没有收到有效响应');
  }

  // 检查是否有内联图片 (markdown 格式 ![](url) 或 base64)
  const imgMatch = content.match(/!\[.*?\]\((.*?)\)/);
  const b64Match = content.match(/data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)/);

  const outputDir = path.resolve(__dirname, 'output');
  const timestamp = Date.now();

  if (b64Match) {
    const ext = b64Match[1];
    const outFile = path.join(outputDir, `${style}_${timestamp}.${ext}`);
    fs.writeFileSync(outFile, Buffer.from(b64Match[2], 'base64'));
    console.log(`✅ 图片已保存: ${outFile}`);
    return outFile;
  }

  if (imgMatch && imgMatch[1].startsWith('http')) {
    // 下载远程图片
    const imgRes = await fetch(imgMatch[1]);
    const arrayBuf = await imgRes.arrayBuffer();
    const ext = imgMatch[1].includes('.png') ? 'png' : 'webp';
    const outFile = path.join(outputDir, `${style}_${timestamp}.${ext}`);
    fs.writeFileSync(outFile, Buffer.from(arrayBuf));
    console.log(`✅ 图片已保存: ${outFile}`);
    return outFile;
  }

  // 没有图片，保存文本响应供调试
  const textFile = path.join(outputDir, `${style}_${timestamp}_response.txt`);
  fs.writeFileSync(textFile, content);
  console.log(`⚠️ 未检测到图片输出，响应已保存: ${textFile}`);
  console.log(`响应内容预览:\n${content.slice(0, 500)}`);
  return null;
}

async function main() {
  console.log('🖼️  多图合成测试');
  console.log(`使用图片: ${IMAGE_FILES.join(', ')}`);
  console.log(`模型: google/gemini-2.5-flash-image via OpenRouter\n`);

  // 风格1: 原图风格（保持卡通插画风）
  await generateComposite(
    'cartoon',
    `Please generate a new image based on these three character portraits.
The image should show all three characters sitting together in a cozy café, chatting and having fun.
IMPORTANT: Keep the same cute cartoon/illustration art style as the original portraits.
The characters should look like they're from the same world — warm colors, soft lighting, detailed background.
Make sure each character's appearance (hair, clothes, features) matches their original portrait closely.`
  );

  // 风格2: 像素风
  await generateComposite(
    'pixel',
    `Please generate a new image based on these three character portraits.
The image should show all three characters in a PIXEL ART style, sitting around a table chatting.
Convert each character into pixel art form while keeping their distinctive features recognizable.
Use a retro pixel art aesthetic — 16-bit style with a cozy indoor scene.
Each character should be clearly recognizable from their original portrait.`
  );

  console.log('\n🎉 全部完成！');
}

main().catch((err) => {
  console.error('❌ 出错:', err.message);
  process.exit(1);
});
