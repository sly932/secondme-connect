import prisma from "./prisma";
import { chatStream } from "./secondme";
import { deductCredits, addCredits, refundCredits } from "./credits";
import logger from "./logger";
import { TaskStatus } from "@prisma/client";
import { taskEvents } from "./task-events";
import { getService } from "./ai-providers";

const TIMEOUT_WRITING = 2 * 60 * 1000; // 2 分钟
const TIMEOUT_PAINTING = 3 * 60 * 1000; // 3 分钟
const { url: SILICONFLOW_IMAGE_URL, model: SILICONFLOW_IMAGE_MODEL, apiKey: SILICONFLOW_API_KEY } = getService("taskImage");

const MAX_CONSULT_ROUNDS = 3;
const TIMEOUT_PER_ROUND = 60 * 1000; // 每轮 1 分钟

/** 查询 worker 信息并生成 system prompt */
async function getWorkerRolePrompt(workerId: string): Promise<{
  workerName: string;
  rolePrompt: string;
}> {
  const worker = await prisma.user.findUnique({
    where: { id: workerId },
    select: { name: true, bio: true, isNpc: true },
  });
  const workerName = worker?.name || "分身";

  if (worker?.isNpc && worker.name) {
    const rolePrompt = [
      `## 角色`,
      `你是「${worker.name}」。${worker.bio || ""}`,
      ``,
      `## 要求`,
      `- 始终以「${worker.name}」的身份、语气和视角交流，不要跳出角色`,
      `- 根据你角色的实际经验和职业经历来回答`,
    ].join("\n");
    return { workerName, rolePrompt };
  }

  return {
    workerName,
    rolePrompt: "请根据你的实际经验和职业经历来回答，保持真实、有深度的交流。",
  };
}

/**
 * 执行咨询任务 — 用户分身与匹配分身之间的多轮对话
 */
export async function executeConsultTask(
  taskId: string,
  publisherId: string,
  publisherSecondmeId: string,
  workerId: string,
  workerSecondmeId: string,
  description: string,
  creditCost: number
): Promise<string> {
  logger.info("Executing consult task", { taskId, publisherId, workerId });

  try {
    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.EVALUATING },
    });
    await sleep(1000);

    const deducted = await deductCredits(publisherId, creditCost, `咨询任务`, taskId);
    if (!deducted) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.FAILED, result: "余额不足" },
      });
      return "余额不足";
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.ACCEPTED, startedAt: new Date() },
    });
    await updateTaskStatus(taskId, TaskStatus.EXECUTING);

    const [publisher, worker] = await Promise.all([
      prisma.user.findUnique({
        where: { id: publisherId },
        select: { accessToken: true, name: true, bio: true },
      }),
      prisma.user.findUnique({
        where: { id: workerId },
        select: { accessToken: true },
      }),
    ]);
    if (!publisher) throw new Error("Publisher not found");
    if (!worker) throw new Error("Worker not found");

    const { workerName, rolePrompt: workerSystemPrompt } = await getWorkerRolePrompt(workerId);

    // 发起方 system prompt
    const publisherSystemPrompt = [
      `## 你的身份`,
      `你是「${publisher.name}」。${publisher.bio || ""}`,
      ``,
      `## 交流要求`,
      `- 根据你的实际经验和职业经历来回应对方`,
      `- 可以追问细节、分享自己的看法和经历`,
      `- 保持真实自然的对话风格`,
    ].join("\n");

    // 对话记录
    const transcript: string[] = [];

    const emitProgress = (partial?: string) => {
      const text = partial
        ? [...transcript, partial].join("\n\n")
        : transcript.join("\n\n");
      taskEvents.emit(taskId, { result: text, status: "EXECUTING" });
    };

    // ========== Round 1: 用户 → 匹配分身 ==========
    logger.info("Consult round 1: asking worker", { taskId });
    const stream1 = await chatStream(
      worker.accessToken,
      workerSecondmeId,
      description,
      workerSystemPrompt
    );
    transcript.push(`💬 ${publisher.name}：${description}`);
    const r1 = await streamToText(stream1, TIMEOUT_PER_ROUND, (partial) => {
      emitProgress(`💬 ${workerName}：${partial}`);
    });

    transcript.push(`💬 ${workerName}：${r1.text}`);
    emitProgress();

    // 保存双方的 sessionId，后续轮次直接带上，API 自动维护上下文
    let workerSessionId = r1.sessionId;
    let publisherSessionId: string | undefined;

    // ========== Round 2+: 交替对话 ==========
    for (let round = 2; round <= MAX_CONSULT_ROUNDS; round++) {
      // 发起方分身回应
      logger.info(`Consult round ${round}: publisher responds`, { taskId });
      const stream2 = await chatStream(
        publisher.accessToken,
        publisherSecondmeId,
        r1.text, // 直接传对方的回复作为消息，session 会维护上下文
        publisherSessionId ? undefined : publisherSystemPrompt, // system prompt 仅首次
        publisherSessionId
      );
      const r2 = await streamToText(stream2, TIMEOUT_PER_ROUND, (partial) => {
        emitProgress(`💬 ${publisher.name}：${partial}`);
      });
      if (!publisherSessionId) publisherSessionId = r2.sessionId;

      transcript.push(`💬 ${publisher.name}：${r2.text}`);
      emitProgress();

      // 匹配分身回应
      logger.info(`Consult round ${round}: worker responds`, { taskId });
      const stream3 = await chatStream(
        worker.accessToken,
        workerSecondmeId,
        r2.text,
        undefined, // system prompt 已在 R1 设定
        workerSessionId
      );
      const r3 = await streamToText(stream3, TIMEOUT_PER_ROUND, (partial) => {
        emitProgress(`💬 ${workerName}：${partial}`);
      });
      if (!workerSessionId) workerSessionId = r3.sessionId;

      transcript.push(`💬 ${workerName}：${r3.text}`);
      emitProgress();
    }

    // 完成
    const finalResult = transcript.join("\n\n");
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.COMPLETED,
        result: finalResult,
        completedAt: new Date(),
      },
    });

    taskEvents.emit(taskId, { result: finalResult, status: "COMPLETED" });

    await addCredits(workerId, creditCost, `咨询任务收入`, taskId);
    logger.info("Consult task completed", { taskId, rounds: MAX_CONSULT_ROUNDS });
    return finalResult;
  } catch (err) {
    logger.error("Consult task failed", { taskId, error: (err as Error).message });
    await handleTaskFailure(taskId, publisherId, creditCost);
    throw err;
  }
}

/**
 * 执行写作任务
 */
export async function executeWritingTask(
  taskId: string,
  publisherId: string,
  workerId: string,
  workerSecondmeId: string,
  description: string,
  creditCost: number
): Promise<string> {
  logger.info("Executing writing task", { taskId });

  try {
    await updateTaskStatus(taskId, TaskStatus.EVALUATING);
    await sleep(1500);

    const deducted = await deductCredits(publisherId, creditCost, `写作任务`, taskId);
    if (!deducted) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.FAILED, result: "余额不足" },
      });
      return "余额不足";
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.ACCEPTED, startedAt: new Date() },
    });
    await updateTaskStatus(taskId, TaskStatus.EXECUTING);

    const [worker, workerProfile, publisherUser] = await Promise.all([
      prisma.user.findUnique({
        where: { id: workerId },
        select: { accessToken: true },
      }),
      prisma.user.findUnique({
        where: { id: workerId },
        select: { name: true, bio: true, shades: true },
      }),
      prisma.user.findUnique({
        where: { id: publisherId },
        select: { name: true, bio: true, shades: true },
      }),
    ]);
    if (!worker) throw new Error("Worker not found");

    // 统一的写作 system prompt（NPC 和非 NPC 一致）
    const workerLines: string[] = [];
    if (workerProfile?.name) workerLines.push(`- 姓名: ${workerProfile.name}`);
    if (workerProfile?.bio) workerLines.push(`- 简介: ${workerProfile.bio}`);
    if (workerProfile?.shades) {
      const list = Array.isArray(workerProfile.shades) ? workerProfile.shades : [];
      if (list.length > 0) workerLines.push(`- 兴趣标签: ${list.join("、")}`);
    }

    const writingSystemPrompt = [
      `## 你的身份档案`,
      workerLines.length > 0 ? workerLines.join("\n") : "（未提供）",
      ``,
      `## 要求`,
      `- 根据你的实际经验和职业经历来回答`,
      `- 请以你的风格和知识完成写作任务`,
    ].join("\n");

    // 构建包含提问者背景的 user message
    const publisherLines: string[] = [];
    if (publisherUser?.name) publisherLines.push(`姓名: ${publisherUser.name}`);
    if (publisherUser?.bio) publisherLines.push(`简介: ${publisherUser.bio}`);
    if (publisherUser?.shades) {
      const shadesList = Array.isArray(publisherUser.shades) ? publisherUser.shades : [];
      if (shadesList.length > 0) publisherLines.push(`兴趣标签: ${shadesList.join("、")}`);
    }

    const writingMessage = publisherLines.length > 0
      ? `## 提问者背景\n${publisherLines.join("\n")}\n\n## 写作需求\n${description}`
      : description;

    const stream = await chatStream(worker.accessToken, workerSecondmeId, writingMessage, writingSystemPrompt);
    const { text: result } = await streamToText(stream, TIMEOUT_WRITING, (partial) => {
      taskEvents.emit(taskId, { result: partial, status: "EXECUTING" });
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.COMPLETED, result, completedAt: new Date() },
    });
    taskEvents.emit(taskId, { result, status: "COMPLETED" });

    await addCredits(workerId, creditCost, `写作任务收入`, taskId);
    logger.info("Writing task completed", { taskId });
    return result;
  } catch (err) {
    logger.error("Writing task failed", { taskId, error: (err as Error).message });
    await handleTaskFailure(taskId, publisherId, creditCost);
    throw err;
  }
}

/**
 * 执行绘画任务
 */
export async function executePaintingTask(
  taskId: string,
  publisherId: string,
  workerId: string,
  workerSecondmeId: string,
  description: string,
  creditCost: number
): Promise<{ prompt: string; imageUrl: string }> {
  logger.info("Executing painting task", { taskId });

  try {
    await updateTaskStatus(taskId, TaskStatus.EVALUATING);
    await sleep(1500);

    const deducted = await deductCredits(publisherId, creditCost, `绘画任务`, taskId);
    if (!deducted) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.FAILED, result: "余额不足" },
      });
      return { prompt: "", imageUrl: "" };
    }

    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.ACCEPTED, startedAt: new Date() },
    });
    await updateTaskStatus(taskId, TaskStatus.EXECUTING);

    const [worker, paintingPublisher] = await Promise.all([
      prisma.user.findUnique({
        where: { id: workerId },
        select: { accessToken: true },
      }),
      prisma.user.findUnique({
        where: { id: publisherId },
        select: { name: true, bio: true, shades: true },
      }),
    ]);
    if (!worker) throw new Error("Worker not found");

    // Step 1: 让分身生成绘画 prompt
    const paintingSystemPrompt = [
      `## 要求`,
      `- 根据你的实际经验和职业经历，以你的艺术风格和审美来创作`,
      `- 返回一段详细的英文绘画提示词（prompt），用于 AI 图片生成模型`,
      `- 只返回提示词本身，不要包含任何解释、前缀、标点引号或其他多余内容`,
    ].join("\n");

    // 构建包含提问者背景的 user message
    const paintingPubLines: string[] = [];
    if (paintingPublisher?.name) paintingPubLines.push(`姓名: ${paintingPublisher.name}`);
    if (paintingPublisher?.bio) paintingPubLines.push(`简介: ${paintingPublisher.bio}`);
    if (paintingPublisher?.shades) {
      const shadesList = Array.isArray(paintingPublisher.shades) ? paintingPublisher.shades : [];
      if (shadesList.length > 0) paintingPubLines.push(`兴趣标签: ${shadesList.join("、")}`);
    }

    const paintingMessage = paintingPubLines.length > 0
      ? `## 提问者背景\n${paintingPubLines.join("\n")}\n\n## 绘画需求\n${description}`
      : description;

    const stream = await chatStream(
      worker.accessToken,
      workerSecondmeId,
      paintingMessage,
      paintingSystemPrompt
    );

    let generatedPrompt: string;
    try {
      const r = await streamToText(stream, TIMEOUT_PAINTING, (partial) => {
        taskEvents.emit(taskId, { result: `正在构思绘画提示词...\n\n${partial}`, status: "EXECUTING" });
      });
      generatedPrompt = r.text.trim();
    } catch (err) {
      logger.error("Painting prompt generation failed", { taskId, error: (err as Error).message });
      await prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.FAILED, result: "分身生成绘图提示词失败", completedAt: new Date() },
      });
      await refundCredits(publisherId, creditCost, taskId);
      return { prompt: "", imageUrl: "" };
    }

    if (!generatedPrompt) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.FAILED, result: "分身返回了空的提示词", completedAt: new Date() },
      });
      await refundCredits(publisherId, creditCost, taskId);
      return { prompt: "", imageUrl: "" };
    }

    logger.info("Painting prompt generated", { taskId, promptLength: generatedPrompt.length });

    // Step 2: 调用 SiliconFlow 图片生成 API
    let imageUrl: string;
    try {
      imageUrl = await generateImage(generatedPrompt);
    } catch (err) {
      logger.error("Image generation failed", { taskId, error: (err as Error).message });
      await prisma.task.update({
        where: { id: taskId },
        data: { status: TaskStatus.FAILED, result: "图片生成失败: " + (err as Error).message, completedAt: new Date() },
      });
      await refundCredits(publisherId, creditCost, taskId);
      return { prompt: generatedPrompt, imageUrl: "" };
    }

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.COMPLETED,
        result: generatedPrompt,
        resultUrl: imageUrl,
        completedAt: new Date(),
      },
    });

    taskEvents.emit(taskId, { result: generatedPrompt, status: "COMPLETED", resultUrl: imageUrl });

    await addCredits(workerId, creditCost, `绘画任务收入`, taskId);
    logger.info("Painting task completed", { taskId, imageUrl });
    return { prompt: generatedPrompt, imageUrl };
  } catch (err) {
    logger.error("Painting task failed", { taskId, error: (err as Error).message });
    await handleTaskFailure(taskId, publisherId, creditCost);
    throw err;
  }
}

// ============================================================
// Helpers
// ============================================================

async function generateImage(prompt: string): Promise<string> {
  const res = await fetch(SILICONFLOW_IMAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SILICONFLOW_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SILICONFLOW_IMAGE_MODEL,
      prompt,
      image_size: "1024x768",
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`SiliconFlow image generation failed (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  // SiliconFlow 返回格式: { images: [{ url: "..." }] }
  const url = data?.images?.[0]?.url;
  if (!url) throw new Error("SiliconFlow returned no image URL");
  return url;
}

async function updateTaskStatus(taskId: string, status: TaskStatus) {
  await prisma.task.update({ where: { id: taskId }, data: { status } });
}

async function handleTaskFailure(taskId: string, publisherId: string, creditCost: number) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, select: { status: true } });
  // 仅在已扣费的情况下退款
  if (task && (task.status === TaskStatus.ACCEPTED || task.status === TaskStatus.EXECUTING)) {
    await refundCredits(publisherId, creditCost, taskId);
  }
  await prisma.task.update({
    where: { id: taskId },
    data: { status: TaskStatus.FAILED, completedAt: new Date() },
  });
  taskEvents.emit(taskId, { result: "任务执行失败", status: "FAILED" });
}

interface StreamResult {
  text: string;
  sessionId?: string;
}

/**
 * 解析 SSE 流，提取 chat completion 的 content 字段和 sessionId
 * 格式:
 *   event: session
 *   data: {"sessionId": "labs_sess_xxx"}
 *   data: {"choices":[{"delta":{"content":"xxx"}}]}
 *   data: [DONE]
 */
async function streamToText(
  stream: ReadableStream,
  timeoutMs: number,
  onProgress?: (partial: string) => void
): Promise<StreamResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Task execution timeout"));
    }, timeoutMs);

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let sessionId: string | undefined;
    let buffer = "";

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          clearTimeout(timer);
          resolve({ text: result, sessionId });
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            // 提取 sessionId
            if (parsed?.sessionId && !sessionId) {
              sessionId = parsed.sessionId;
            }
            const content = parsed?.choices?.[0]?.delta?.content;
            if (content) {
              result += content;
            }
          } catch {
            // 跳过非 JSON 行
          }
        }

        onProgress?.(result);
        read();
      }).catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    }

    read();
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
