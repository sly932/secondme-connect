import prisma from "./prisma";
import { chatStream } from "./secondme";
import { deductCredits, addCredits, refundCredits } from "./credits";
import logger from "./logger";
import { TaskStatus } from "@prisma/client";
import { taskEvents } from "./task-events";

const TIMEOUT_WRITING = 2 * 60 * 1000; // 2 分钟
const TIMEOUT_PAINTING = 3 * 60 * 1000; // 3 分钟
const SILICONFLOW_IMAGE_URL =
  process.env.SILICONFLOW_IMAGE_URL || "https://api.siliconflow.cn/v1/images/generations";
const SILICONFLOW_IMAGE_MODEL =
  process.env.SILICONFLOW_IMAGE_MODEL || "Kwai-Kolors/Kolors";

const MAX_CONSULT_ROUNDS = 3;
const TIMEOUT_PER_ROUND = 60 * 1000; // 每轮 1 分钟

/** 查询 worker 信息并生成 NPC 角色 system prompt */
async function getWorkerRolePrompt(workerId: string): Promise<{
  workerName: string;
  rolePrompt: string | undefined;
}> {
  const worker = await prisma.user.findUnique({
    where: { id: workerId },
    select: { name: true, bio: true, isNpc: true },
  });
  const workerName = worker?.name || "分身";
  const rolePrompt = worker?.isNpc && worker.name
    ? `你现在是「${worker.name}」。${worker.bio ? `你的身份：${worker.bio}。` : ""}请始终以「${worker.name}」的身份、语气和视角来交流和回答问题，不要跳出这个角色。`
    : undefined;
  return { workerName, rolePrompt };
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
        select: { accessToken: true, name: true },
      }),
      prisma.user.findUnique({
        where: { id: workerId },
        select: { accessToken: true },
      }),
    ]);
    if (!publisher) throw new Error("Publisher not found");
    if (!worker) throw new Error("Worker not found");

    const { workerName, rolePrompt: workerSystemPrompt } = await getWorkerRolePrompt(workerId);

    // 对话记录
    const transcript: string[] = [];

    const emitProgress = (partial?: string) => {
      const text = partial
        ? [...transcript, partial].join("\n\n")
        : transcript.join("\n\n");
      taskEvents.emit(taskId, { result: text, status: "EXECUTING" });
    };

    // ========== Round 1: 用户分身 → 匹配分身 ==========
    // 直接传递用户原始消息
    const openingMessage = description;

    logger.info("Consult round 1: asking worker", { taskId });
    const stream1 = await chatStream(
      worker.accessToken,
      workerSecondmeId,
      openingMessage,
      workerSystemPrompt
    );
    transcript.push(`💬 ${publisher.name}：${description}`);
    const workerReply1 = await streamToText(stream1, TIMEOUT_PER_ROUND, (partial) => {
      emitProgress(`💬 ${workerName}：${partial}`);
    });

    transcript.push(`💬 ${workerName}：${workerReply1}`);
    emitProgress();

    // ========== Round 2+: 交替对话 ==========
    let lastWorkerReply = workerReply1;

    for (let round = 2; round <= MAX_CONSULT_ROUNDS; round++) {
      // 用户分身回应
      logger.info(`Consult round ${round}: publisher responds`, { taskId });
      const publisherContext =
        `对方刚才说：\n"${lastWorkerReply}"\n\n请根据你的理解和经验，继续和对方交流，可以追问细节或分享你的想法。`;
      const stream2 = await chatStream(
        publisher.accessToken,
        publisherSecondmeId,
        publisherContext
      );
      const publisherReply = await streamToText(stream2, TIMEOUT_PER_ROUND, (partial) => {
        emitProgress(`💬 ${publisher.name}：${partial}`);
      });

      transcript.push(`💬 ${publisher.name}：${publisherReply}`);
      emitProgress();

      // 匹配分身回应
      logger.info(`Consult round ${round}: worker responds`, { taskId });
      const workerContext =
        `对方刚才说：\n"${publisherReply}"\n\n请继续和对方交流，分享你的见解和建议。`;
      const stream3 = await chatStream(
        worker.accessToken,
        workerSecondmeId,
        workerContext,
        workerSystemPrompt
      );
      const workerReply = await streamToText(stream3, TIMEOUT_PER_ROUND, (partial) => {
        emitProgress(`💬 ${workerName}：${partial}`);
      });

      transcript.push(`💬 ${workerName}：${workerReply}`);
      emitProgress();

      lastWorkerReply = workerReply;
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

    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: { accessToken: true },
    });
    if (!worker) throw new Error("Worker not found");

    const { rolePrompt } = await getWorkerRolePrompt(workerId);
    const writingSystemPrompt = rolePrompt
      ? `${rolePrompt}\n\n请以你的风格和知识完成写作任务。`
      : undefined;

    const stream = await chatStream(worker.accessToken, workerSecondmeId, description, writingSystemPrompt);
    const result = await streamToText(stream, TIMEOUT_WRITING, (partial) => {
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

    const worker = await prisma.user.findUnique({
      where: { id: workerId },
      select: { accessToken: true },
    });
    if (!worker) throw new Error("Worker not found");

    // Step 1: 让分身生成绘画 prompt
    const { rolePrompt } = await getWorkerRolePrompt(workerId);
    const paintingSystemPrompt = rolePrompt
      ? `${rolePrompt}\n\n现在请根据用户的需求，以你的艺术风格和审美，返回一段详细的英文绘画提示词（prompt），用于 AI 图片生成模型。只返回提示词本身，不要包含任何解释、前缀、标点引号或其他多余内容。`
      : "你是一个绘画提示词生成助手。根据用户的需求，返回一段详细的英文绘画提示词（prompt），用于 AI 图片生成模型。只返回提示词本身，不要包含任何解释、前缀、标点引号或其他多余内容。";
    const stream = await chatStream(
      worker.accessToken,
      workerSecondmeId,
      description,
      paintingSystemPrompt
    );

    let generatedPrompt: string;
    try {
      generatedPrompt = (await streamToText(stream, TIMEOUT_PAINTING, (partial) => {
        taskEvents.emit(taskId, { result: `正在构思绘画提示词...\n\n${partial}`, status: "EXECUTING" });
      })).trim();
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
  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) throw new Error("SILICONFLOW_API_KEY is not configured");

  const res = await fetch(SILICONFLOW_IMAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

/**
 * 解析 SSE 流，提取 chat completion 的 content 字段
 * 格式: data: {"choices":[{"delta":{"content":"xxx"}}]}
 */
async function streamToText(
  stream: ReadableStream,
  timeoutMs: number,
  onProgress?: (partial: string) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Task execution timeout"));
    }, timeoutMs);

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = "";
    let buffer = ""; // SSE 行缓冲

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          clearTimeout(timer);
          resolve(result);
          return;
        }

        buffer += decoder.decode(value, { stream: true });

        // 按行解析 SSE
        const lines = buffer.split("\n");
        // 最后一行可能不完整，留到下次
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed?.choices?.[0]?.delta?.content;
            if (content) {
              result += content;
            }
          } catch {
            // 跳过非 JSON 行（如 event: session）
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
