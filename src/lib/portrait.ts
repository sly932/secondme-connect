import prisma from "./prisma";
import logger from "./logger";
import { chatStream } from "./secondme";
import { uploadPortrait } from "./storage";
import { getService } from "./ai-providers";

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

  // 拼接用户信息
  const lines: string[] = [];
  if (dbUser.name) lines.push(`name: ${dbUser.name}`);
  if (dbUser.bio) lines.push(`summary: ${dbUser.bio}`);
  if (dbUser.shades) {
    const shadesList = Array.isArray(dbUser.shades) ? dbUser.shades : [];
    if (shadesList.length > 0) lines.push(`interests: ${shadesList.join(", ")}`);
  }
  const userInfo = lines.join("\n");

  const message = `Based on the following user profile, write a pixel art self-portrait prompt for AI image generation.

--- User Profile ---
${userInfo}
--- End ---

Generate a vivid, bright, and energetic pixel art portrait prompt for this person.`;

  // Step 1: 调用分身获取描述
  logger.info("Portrait: getting prompt from SecondMe", { userId });
  const stream = await chatStream(dbUser.accessToken, dbUser.secondmeId, message, SYSTEM_PROMPT);
  const prompt = await parseSSE(stream);
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
