import prisma from "./prisma";
import { chatStream } from "./secondme";
import { deductCredits, addCredits, refundCredits } from "./credits";
import logger from "./logger";
import { TaskStatus } from "@prisma/client";

const TIMEOUT_WRITING = 2 * 60 * 1000; // 2 分钟
const TIMEOUT_PAINTING = 3 * 60 * 1000; // 3 分钟
const SILICONFLOW_IMAGE_URL =
  process.env.SILICONFLOW_IMAGE_URL || "https://api.siliconflow.cn/v1/images/generations";
const SILICONFLOW_IMAGE_MODEL =
  process.env.SILICONFLOW_IMAGE_MODEL || "Kwai-Kolors/Kolors";

/**
 * 执行咨询任务 - 与单个分身对话
 */
export async function executeConsultTask(
  taskId: string,
  publisherId: string,
  workerId: string,
  workerSecondmeId: string,
  description: string,
  creditCost: number
): Promise<string> {
  logger.info("Executing consult task", { taskId, publisherId, workerId });

  try {
    // 更新状态: 评估中
    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.EVALUATING },
    });

    // 模拟评估延迟
    await sleep(1000);

    // 更新状态: 已接单, 扣费
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

    // 更新状态: 执行中
    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.EXECUTING },
    });

    // 获取发布者的 access token 来调用 chat
    const publisher = await prisma.user.findUnique({
      where: { id: publisherId },
      select: { accessToken: true },
    });

    if (!publisher) throw new Error("Publisher not found");

    // 调用 SecondMe chat stream
    const stream = await chatStream(publisher.accessToken, workerSecondmeId, description);
    const result = await streamToText(stream, TIMEOUT_WRITING);

    // 完成
    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: TaskStatus.COMPLETED,
        result,
        completedAt: new Date(),
      },
    });

    // 打款给接单方
    await addCredits(workerId, creditCost, `咨询任务收入`, taskId);

    logger.info("Consult task completed", { taskId, resultLength: result.length });
    return result;
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

    const publisher = await prisma.user.findUnique({
      where: { id: publisherId },
      select: { accessToken: true },
    });
    if (!publisher) throw new Error("Publisher not found");

    const prompt = `请以你自身的风格和知识，完成以下写作任务：\n\n${description}`;
    const stream = await chatStream(publisher.accessToken, workerSecondmeId, prompt);
    const result = await streamToText(stream, TIMEOUT_WRITING);

    await prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.COMPLETED, result, completedAt: new Date() },
    });

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

    const publisher = await prisma.user.findUnique({
      where: { id: publisherId },
      select: { accessToken: true },
    });
    if (!publisher) throw new Error("Publisher not found");

    // Step 1: 让分身生成绘画 prompt
    const systemPrompt =
      "你是一个绘画提示词生成助手。根据用户的需求，返回一段详细的英文绘画提示词（prompt），用于 AI 图片生成模型。" +
      "只返回提示词本身，不要包含任何解释、前缀、标点引号或其他多余内容。";
    const stream = await chatStream(
      publisher.accessToken,
      workerSecondmeId,
      description,
      systemPrompt
    );

    let generatedPrompt: string;
    try {
      generatedPrompt = (await streamToText(stream, TIMEOUT_PAINTING)).trim();
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
}

async function streamToText(stream: ReadableStream, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Task execution timeout"));
    }, timeoutMs);

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let result = "";

    function read() {
      reader.read().then(({ done, value }) => {
        if (done) {
          clearTimeout(timer);
          resolve(result);
          return;
        }
        result += decoder.decode(value, { stream: true });
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
