import prisma from "./prisma";
import { chatStream } from "./secondme";
import { deductCredits, addCredits, refundCredits } from "./credits";
import logger from "./logger";
import { TaskStatus } from "@prisma/client";

const TIMEOUT_WRITING = 2 * 60 * 1000; // 2 分钟
const TIMEOUT_PAINTING = 3 * 60 * 1000; // 3 分钟
const POLLINATIONS_URL = "https://image.pollinations.ai/prompt/";

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

    // Step 1: 生成绘画 prompt
    const promptRequest = `请根据以下描述生成一个详细的英文绘画 prompt（仅输出 prompt 本身，不要其他内容）：\n\n${description}`;
    const stream = await chatStream(publisher.accessToken, workerSecondmeId, promptRequest);
    const generatedPrompt = await streamToText(stream, TIMEOUT_PAINTING);

    // Step 2: 调用 Pollinations.ai
    const imageUrl = `${POLLINATIONS_URL}${encodeURIComponent(generatedPrompt)}?width=1024&height=768&nologo=true`;

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
