import prisma from "./prisma";
import logger from "./logger";

/**
 * 扣除用户 credit
 * 返回 true 表示扣除成功, false 表示余额不足
 */
export async function deductCredits(
  userId: string,
  amount: number,
  reason: string,
  taskId?: string
): Promise<boolean> {
  logger.info("Deducting credits", { userId, amount, reason, taskId });

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { credits: true } });
    if (!user || user.credits < amount) {
      logger.warn("Insufficient credits", { userId, balance: user?.credits, required: amount });
      return false;
    }

    const newBalance = user.credits - amount;

    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance },
    });

    await tx.creditLog.create({
      data: {
        userId,
        amount: -amount,
        balance: newBalance,
        reason,
        taskId,
      },
    });

    logger.info("Credits deducted", { userId, amount, newBalance });
    return true;
  });
}

/**
 * 给用户增加 credit（接单收入）
 */
export async function addCredits(
  userId: string,
  amount: number,
  reason: string,
  taskId?: string
): Promise<void> {
  logger.info("Adding credits", { userId, amount, reason, taskId });

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        credits: { increment: amount },
        totalEarnings: { increment: amount },
        totalOrders: { increment: 1 },
      },
      select: { credits: true },
    });

    await tx.creditLog.create({
      data: {
        userId,
        amount,
        balance: user.credits,
        reason,
        taskId,
      },
    });

    logger.info("Credits added", { userId, amount, newBalance: user.credits });
  });
}

const DAILY_BONUS = 100;
const CREDIT_CAP = 500;

/**
 * 每日 credit 补给 — 首次登录时调用
 * 如果今天还没领过且余额 < 上限，发放 100 credit
 */
export async function claimDailyCredit(userId: string): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true, lastDailyCredit: true },
    });
    if (!user) return false;

    const lastClaim = user.lastDailyCredit;
    if (lastClaim && lastClaim >= today) return false;
    if (user.credits >= CREDIT_CAP) {
      await tx.user.update({ where: { id: userId }, data: { lastDailyCredit: new Date() } });
      return false;
    }

    const newBalance = Math.min(user.credits + DAILY_BONUS, CREDIT_CAP);
    const added = newBalance - user.credits;

    await tx.user.update({
      where: { id: userId },
      data: { credits: newBalance, lastDailyCredit: new Date() },
    });

    await tx.creditLog.create({
      data: { userId, amount: added, balance: newBalance, reason: "DAILY_BONUS" },
    });

    logger.info("Daily credit claimed", { userId, added, newBalance });
    return true;
  });
}

/**
 * 退还 credit（任务失败/超时）
 */
export async function refundCredits(
  userId: string,
  amount: number,
  taskId: string
): Promise<void> {
  await addCredits(userId, amount, `任务退款 (${taskId})`, taskId);
}
