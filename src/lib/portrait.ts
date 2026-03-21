import prisma from "./prisma";
import logger from "./logger";
import { chatStream } from "./secondme";
import { uploadPortrait } from "./storage";
import { getService } from "./ai-providers";

/** 构建自画像 system prompt（包含分身档案） */
function buildPortraitSystemPrompt(name: string, bio?: string | null, shades?: unknown): string {
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
    `- 温暖友好的氛围，良好的光照（日光、黄金时段或温馨室内光）`,
    `- 角色表情生动亲切（微笑、自信等自然表情）`,
    `- 背景应体现人物的兴趣和个性，丰富但不杂乱`,
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

const { url: SILICONFLOW_URL, model: SILICONFLOW_MODEL, apiKey: SILICONFLOW_KEY } = getService("portrait");

/** 解析 SSE 流提取完整文本 */
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

/** 调用 SiliconFlow 生成图片 */
async function generateImage(prompt: string): Promise<string> {
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
    throw new Error(`Image API error: ${res.status}`);
  }
  const data = await res.json();
  const url = data.images?.[0]?.url || data.data?.[0]?.url;
  if (!url) throw new Error("No image URL returned");
  return url;
}

/**
 * 为指定用户生成自画像（完整流程）
 * 调分身获取描述 → 生图 → 上传 Supabase → 存 DB
 */
export async function generatePortraitForUser(userId: string): Promise<{ portraitUrl: string; portraitPrompt: string }> {
  const dbUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      secondmeId: true,
      accessToken: true,
      name: true,
      bio: true,
      shades: true,
    },
  });
  if (!dbUser) throw new Error("User not found");

  const systemPrompt = buildPortraitSystemPrompt(dbUser.name, dbUser.bio, dbUser.shades);
  const message = `你是${dbUser.name}，请根据你对自己的认知，完成你的像素风自画像提示词。`;

  // Step 1: 调用分身获取描述
  logger.info("Portrait: getting prompt from SecondMe", { userId });
  const stream = await chatStream(dbUser.accessToken, dbUser.secondmeId, message, systemPrompt);
  const rawResponse = await parseSSE(stream);

  const prompt = rawResponse.trim();
  if (!prompt || prompt.length < 20) {
    throw new Error("Portrait prompt too short");
  }

  // Step 2: 生成图片
  logger.info("Portrait: generating image", { userId, promptLength: prompt.length });
  const tempImageUrl = await generateImage(prompt);

  // Step 3: 上传到 Supabase Storage
  logger.info("Portrait: uploading to storage", { userId });
  const permanentUrl = await uploadPortrait(userId, tempImageUrl);

  // Step 4: 存入数据库
  await prisma.user.update({
    where: { id: userId },
    data: { portraitUrl: permanentUrl, portraitPrompt: prompt },
  });

  logger.info("Portrait: complete", { userId });
  return { portraitUrl: permanentUrl, portraitPrompt: prompt };
}
