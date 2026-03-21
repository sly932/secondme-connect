import { getService } from "./ai-providers";
import { uploadSceneImage } from "./storage";
import prisma from "./prisma";
import logger from "./logger";

// ---------------------------------------------------------------------------
// 场景类型与 Prompt 映射
// ---------------------------------------------------------------------------

export type SceneType =
  | "consult"
  | "writing"
  | "painting"
  | "game.blackjack"
  | "game.poker";

interface ScenePromptConfig {
  /** 场景显示名 */
  label: string;
  /** 生成 prompt 的函数，n = 参与人数 */
  buildPrompt: (n: number) => string;
  /** 是否排除发起者的自画像（绘画场景为 true） */
  excludePublisher?: boolean;
}

const COMMON_RULES = (n: number) =>
  `Generate exactly one 768x432 image (16:9). The image must contain exactly ${n} characters. ` +
  `Each character must be clearly recognizable from their reference portrait — ` +
  `preserve distinctive features like hairstyle, clothing, and face. ` +
  `Keep the same art style as the original portraits.`;

export const SCENE_PROMPTS: Record<SceneType, ScenePromptConfig> = {
  // 1. 咨询/对话场景
  consult: {
    label: "对话场景",
    buildPrompt: (n) =>
      `Generate an image of ${n} characters having a lively conversation together. ` +
      `They are sitting in a cozy café or living room, facing each other, chatting with ` +
      `animated expressions. Some are gesturing, some are listening intently. ` +
      `There are coffee cups, snacks, and warm lighting. ` +
      COMMON_RULES(n),
  },

  // 2. 写作/产物场景（排除发起者）
  writing: {
    label: "协作场景",
    excludePublisher: true,
    buildPrompt: (n) =>
      `Generate an image of ${n} characters all busy working in a shared workspace. ` +
      `Everyone is equally occupied — some typing on laptops, some writing on paper at desks, ` +
      `some talking on the phone, some reviewing documents. ` +
      `No one is leading or presenting — they are all independently focused on their own tasks. ` +
      `The atmosphere is productive and lively, with desks, screens, and stationery around. ` +
      COMMON_RULES(n),
  },

  // 3. 绘画场景（排除发起者）
  painting: {
    label: "绘画场景",
    excludePublisher: true,
    buildPrompt: (n) =>
      `Generate an image of ${n} characters painting together in an art studio. ` +
      `Each character is at their own easel or canvas, holding brushes and palettes, ` +
      `creating colorful artwork. The studio has paint splatters, art supplies, ` +
      `and finished paintings on the walls. Bright and creative atmosphere. ` +
      COMMON_RULES(n),
  },

  // 4a. 游戏 — 21 点
  "game.blackjack": {
    label: "21 点",
    buildPrompt: (n) =>
      `Generate an image of ${n} characters sitting around a green felt blackjack table ` +
      `playing cards. Each character has cards in front of them and poker chips stacked nearby. ` +
      `There is a dealer area with cards face up. The characters have excited, competitive expressions. ` +
      `Casino-style warm lighting with a fun, cartoonish vibe. ` +
      COMMON_RULES(n),
  },

  // 4b. 游戏 — 德州扑克
  "game.poker": {
    label: "德州扑克",
    buildPrompt: (n) =>
      `Generate an image of ${n} characters sitting around an oval poker table ` +
      `playing Texas Hold'em. Community cards are dealt in the center of the table. ` +
      `Each character holds two hole cards and has stacks of chips. ` +
      `Some characters are bluffing, some look confident, some are thinking hard. ` +
      `Dramatic but fun lighting, green felt table, cartoonish casino atmosphere. ` +
      COMMON_RULES(n),
  },
};

/** 所有可用场景 key 列表 */
export const SCENE_TYPES = Object.keys(SCENE_PROMPTS) as SceneType[];

// ---------------------------------------------------------------------------
// 图像压缩工具（服务端：将 base64 图片用 sharp 压缩到 512px）
// ---------------------------------------------------------------------------

/**
 * 压缩 base64 图片到指定最大边长，返回 JPEG base64 data URL
 * 服务端使用 sharp，如果 sharp 不可用则原样返回
 */
export async function compressImageBase64(
  dataUrl: string,
  maxSize = 512
): Promise<string> {
  try {
    const sharp = (await import("sharp")).default;
    const base64Data = dataUrl.split(",")[1];
    const inputBuffer = Buffer.from(base64Data, "base64");

    const outputBuffer = await sharp(inputBuffer)
      .resize(maxSize, maxSize, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();

    return `data:image/jpeg;base64,${outputBuffer.toString("base64")}`;
  } catch {
    // sharp 不可用时原样返回
    logger.warn("sharp not available, skipping image compression");
    return dataUrl;
  }
}

// ---------------------------------------------------------------------------
// 场景图生成（调用 OpenRouter 多模态模型）
// ---------------------------------------------------------------------------

const {
  url: OPENROUTER_URL,
  model: SCENE_MODEL,
  apiKey: OPENROUTER_KEY,
} = getService("sceneImage");

interface GenerateSceneOptions {
  /** 场景类型 */
  scene: SceneType;
  /** 参与者自画像 data URL 数组，第一张是发起者 */
  portraitDataUrls: string[];
  /** 可选：自定义提示词追加 */
  extraPrompt?: string;
}

interface GenerateSceneResult {
  /** 生成的图片 data URL (base64) */
  imageDataUrl: string;
  /** 使用的 prompt */
  prompt: string;
  /** 场景类型 */
  scene: SceneType;
}

/**
 * 生成场景合成图
 */
export async function generateSceneImage(
  opts: GenerateSceneOptions
): Promise<GenerateSceneResult> {
  const config = SCENE_PROMPTS[opts.scene];
  if (!config) throw new Error(`Unknown scene type: ${opts.scene}`);

  // 绘画场景排除发起者（第一张图）
  let portraits = opts.portraitDataUrls;
  if (config.excludePublisher && portraits.length > 1) {
    portraits = portraits.slice(1);
  }

  if (portraits.length < 1) {
    throw new Error("At least 1 portrait is required");
  }

  // 压缩图片
  const compressed = await Promise.all(
    portraits.map((url) => compressImageBase64(url))
  );

  const prompt = config.buildPrompt(compressed.length) +
    (opts.extraPrompt ? `\n\nAdditional context: ${opts.extraPrompt}` : "");

  logger.info("Scene image: generating", {
    scene: opts.scene,
    characterCount: compressed.length,
    promptLength: prompt.length,
  });

  // 构建多模态消息
  const imageContents = compressed.map((dataUrl) => ({
    type: "image_url" as const,
    image_url: { url: dataUrl },
  }));

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "HTTP-Referer": "https://connect.second.me",
      "X-Title": "sm-connect scene-image",
    },
    body: JSON.stringify({
      model: SCENE_MODEL,
      messages: [
        {
          role: "user",
          content: [...imageContents, { type: "text", text: prompt }],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Scene image API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const msg = data.choices?.[0]?.message;

  // 提取图片 — OpenRouter 返回在 message.images[]
  let imageDataUrl: string | null = null;

  if (Array.isArray(msg?.images)) {
    for (const img of msg.images) {
      if (img.type === "image_url" && img.image_url?.url) {
        imageDataUrl = img.image_url.url;
        break;
      }
    }
  }

  // fallback: content 数组
  if (!imageDataUrl && Array.isArray(msg?.content)) {
    for (const part of msg.content) {
      if (part.type === "image_url") {
        imageDataUrl = part.image_url?.url;
        break;
      }
    }
  }

  if (!imageDataUrl) {
    const textContent = typeof msg?.content === "string" ? msg.content : JSON.stringify(msg);
    throw new Error(`Model did not return an image. Response: ${textContent.slice(0, 300)}`);
  }

  logger.info("Scene image: generated", {
    scene: opts.scene,
    imageSizeKB: Math.round(imageDataUrl.length / 1024),
  });

  return { imageDataUrl, prompt, scene: opts.scene };
}

// ---------------------------------------------------------------------------
// 生成并上传到 Supabase Storage
// ---------------------------------------------------------------------------

/**
 * 生成场景图并持久化到 Supabase Storage
 * @returns 永久公开 URL
 */
export async function generateAndUploadSceneImage(
  opts: GenerateSceneOptions & {
    /** Storage 文件路径标识，如 taskId 或 roomId */
    storageKey: string;
  }
): Promise<{ url: string; prompt: string }> {
  const result = await generateSceneImage(opts);

  // 从 data URL 提取 buffer
  const base64Data = result.imageDataUrl.split(",")[1];
  const buffer = Buffer.from(base64Data, "base64");
  const mimeType = result.imageDataUrl.startsWith("data:image/png")
    ? "image/png"
    : "image/jpeg";

  const url = await uploadSceneImage(
    opts.storageKey,
    opts.scene,
    buffer,
    mimeType
  );

  return { url, prompt: result.prompt };
}

// ---------------------------------------------------------------------------
// 任务级便捷函数 — 匹配完成后异步调用
// ---------------------------------------------------------------------------

/** 从 TaskType/TaskCategory 映射到 SceneType */
export function resolveSceneType(
  taskType: string,
  taskCategory?: string | null
): SceneType | null {
  if (taskType === "PORTRAIT") return null; // 自画像不生成场景图
  if (taskType === "CONSULT") return "consult";
  if (taskType === "GAME") {
    if (taskCategory === "BLACKJACK") return "game.blackjack";
    if (taskCategory === "TEXAS_HOLDEM") return "game.poker";
    return "game.blackjack"; // fallback
  }
  // MARKETPLACE
  if (taskCategory === "WRITING") return "writing";
  if (taskCategory === "PAINTING") return "painting";
  return "consult"; // fallback
}

/**
 * 匹配完成后为一批 Task 生成场景图并写入 sceneImageUrl
 *
 * @param taskIds 这批任务的 ID 列表（同一个 Post 下）
 * @param publisherId 发起者 userId
 * @param workerIds 匹配到的 worker userId 列表
 * @param scene 场景类型
 *
 * 异步调用，不阻塞主流程。出错只记日志不抛异常。
 */
export async function generateSceneForTasks(
  taskIds: string[],
  publisherId: string,
  workerIds: string[],
  scene: SceneType
): Promise<void> {
  try {
    const config = SCENE_PROMPTS[scene];

    // 收集参与者 portraitUrl — 发起者在前
    const allUserIds = config.excludePublisher
      ? workerIds
      : [publisherId, ...workerIds];

    const users = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, portraitUrl: true },
    });

    // 按 allUserIds 顺序排列
    const ordered = allUserIds
      .map((id) => users.find((u) => u.id === id))
      .filter((u) => u?.portraitUrl) as { id: string; portraitUrl: string }[];

    if (ordered.length < 1) {
      logger.warn("Scene image skipped: no portraits available", { taskIds, scene });
      return;
    }

    // 下载自画像并转为 data URL
    const portraitDataUrls = await Promise.all(
      ordered.map(async (u) => {
        const res = await fetch(u.portraitUrl);
        if (!res.ok) throw new Error(`Download portrait failed for ${u.id}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const mime = res.headers.get("content-type") || "image/png";
        return `data:${mime};base64,${buf.toString("base64")}`;
      })
    );

    const storageKey = `tasks_${taskIds[0]}`;
    const result = await generateAndUploadSceneImage({
      scene,
      portraitDataUrls,
      storageKey,
    });

    // 更新所有相关 Task 的 sceneImageUrl
    await prisma.task.updateMany({
      where: { id: { in: taskIds } },
      data: { sceneImageUrl: result.url },
    });

    logger.info("Scene image generated for tasks", {
      taskIds,
      scene,
      url: result.url,
    });
  } catch (err) {
    logger.error("Scene image generation failed", {
      taskIds,
      scene,
      error: (err as Error).message,
    });
  }
}
