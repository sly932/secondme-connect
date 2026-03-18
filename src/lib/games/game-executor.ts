// 游戏执行器 — 驱动完整游戏流程，调用 SecondMe Chat 获取 AI 决策

import prisma from "../prisma";
import logger from "../logger";
import { chatStream } from "../secondme";
import {
  initBlackjackRound,
  applyBlackjackAction,
  playDealerTurn,
  settleBlackjackRound,
  buildBlackjackPrompt,
  BlackjackState,
  BlackjackAction,
} from "./blackjack";
import {
  initTexasRound,
  applyTexasAction,
  settleTexasRound,
  buildTexasPrompt,
  TexasState,
  TexasAction,
} from "./texas-holdem";
import { handToString } from "./deck";

// 全局事件存储 (roomId -> events[])
const roomEvents: Map<string, GameEvent[]> = new Map();

export interface GameEvent {
  timestamp: number;
  round: number;
  type: "action" | "deal" | "result" | "phase" | "system";
  message: string;
  data?: Record<string, unknown>;
}

export function getRoomEvents(roomId: string): GameEvent[] {
  return roomEvents.get(roomId) || [];
}

function pushEvent(roomId: string, event: GameEvent) {
  if (!roomEvents.has(roomId)) roomEvents.set(roomId, []);
  roomEvents.get(roomId)!.push(event);
}

/** 解析 AI 的 Chat 响应中的 JSON */
function parseAIResponse(text: string): Record<string, unknown> | null {
  try {
    // 尝试直接解析
    return JSON.parse(text.trim());
  } catch {
    // 尝试从文本中提取 JSON
    const match = text.match(/\{[^}]+\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 从 SSE 流中提取实际文本内容 */
function extractTextFromSSE(raw: string): string {
  let text = "";
  const lines = raw.split("\n");

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const dataStr = line.slice(6).trim();
    if (!dataStr || dataStr === "[DONE]") continue;

    try {
      const data = JSON.parse(dataStr);
      // OpenAI-compatible SSE format
      const content =
        data.choices?.[0]?.delta?.content ||
        data.choices?.[0]?.message?.content ||
        data.content ||
        "";
      if (content) text += content;
    } catch {
      // 不是 JSON 的 data 行，跳过
    }
  }

  return text;
}

/** 调用 SecondMe Chat 获取 AI 决策 */
async function getAIDecision(
  accessToken: string,
  targetUserId: string,
  prompt: string
): Promise<string> {
  try {
    const stream = await chatStream(accessToken, targetUserId, prompt);
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let rawResult = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      rawResult += decoder.decode(value, { stream: true });
    }

    // 从 SSE 流中提取实际文本
    const text = extractTextFromSSE(rawResult);

    logger.debug("AI decision parsed", {
      targetUserId,
      rawLength: rawResult.length,
      extractedText: text.substring(0, 200),
    });

    return text || rawResult; // fallback to raw if extraction yields nothing
  } catch (error) {
    logger.error("AI decision call failed", { targetUserId, error: String(error) });
    return "";
  }
}

/** 获取用户的有效 access token (自动刷新) */
async function getUserToken(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accessToken: true, tokenExpiry: true, refreshToken: true, secondmeId: true },
  });

  if (!user) return null;

  // 如果 token 过期，尝试刷新
  if (new Date() > user.tokenExpiry) {
    try {
      const { refreshAccessToken } = await import("../secondme");
      const data = await refreshAccessToken(user.refreshToken);
      await prisma.user.update({
        where: { id: userId },
        data: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token || user.refreshToken,
          tokenExpiry: new Date(Date.now() + (data.expires_in || 7200) * 1000),
        },
      });
      return data.access_token;
    } catch {
      logger.error("Failed to refresh token for game AI", { userId });
      return user.accessToken; // 尝试用旧 token
    }
  }

  return user.accessToken;
}

// ============================================================
// 21点游戏执行
// ============================================================

export async function executeBlackjackGame(roomId: string): Promise<void> {
  logger.info("Starting Blackjack game", { roomId });

  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: { players: { include: { user: true }, orderBy: { position: "asc" } } },
  });

  if (!room) throw new Error("Room not found");

  for (let roundNum = 1; roundNum <= room.totalRounds; roundNum++) {
    logger.info("Starting Blackjack round", { roomId, round: roundNum });

    pushEvent(roomId, {
      timestamp: Date.now(),
      round: roundNum,
      type: "system",
      message: `第 ${roundNum}/${room.totalRounds} 局开始`,
    });

    // 预扣筹码
    const activePlayers = room.players.filter((p) => p.status === "ACTIVE");
    if (activePlayers.length === 0) break;

    for (const p of activePlayers) {
      if (p.chips < room.minChips) {
        await prisma.gamePlayer.update({ where: { id: p.id }, data: { status: "BUSTED" } });
        p.status = "BUSTED";
        pushEvent(roomId, {
          timestamp: Date.now(),
          round: roundNum,
          type: "system",
          message: `${p.user.name} 筹码不足，退出游戏`,
        });
        continue;
      }

      // 预扣
      await prisma.gamePlayer.update({
        where: { id: p.id },
        data: { chips: { decrement: room.minChips } },
      });
      p.chips -= room.minChips;
    }

    const playersForRound = activePlayers
      .filter((p) => p.status === "ACTIVE")
      .map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        isAI: p.isAI,
        chips: p.chips,
      }));

    if (playersForRound.length === 0) break;

    // 初始化
    let state = initBlackjackRound(playersForRound, room.minChips);

    // 创建 GameRound 记录
    const gameRound = await prisma.gameRound.create({
      data: {
        roomId,
        roundNumber: roundNum,
        dealerHand: state.dealer.hand as unknown as Record<string, unknown>[],
      },
    });

    // 发牌事件
    for (const p of state.players) {
      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "deal",
        message: `${p.name} 收到手牌: ${handToString(p.hand)}`,
        data: { playerId: p.id, hand: p.hand },
      });
    }
    pushEvent(roomId, {
      timestamp: Date.now(),
      round: roundNum,
      type: "deal",
      message: `庄家明牌: ${state.dealer.hand[0].suit}${state.dealer.hand[0].rank}`,
      data: { dealerUpCard: state.dealer.hand[0] },
    });

    // 玩家回合
    while (state.phase === "player_turns") {
      const currentPlayer = state.players[state.currentPlayerIndex];
      let action: BlackjackAction;

      if (currentPlayer.isAI) {
        // AI 决策
        const token = await getUserToken(currentPlayer.userId);
        if (token) {
          const prompt = buildBlackjackPrompt(currentPlayer, state.dealer.hand[0]);
          const response = await getAIDecision(token, currentPlayer.userId, prompt);
          const parsed = parseAIResponse(response);

          if (parsed && (parsed.action === "hit" || parsed.action === "stand")) {
            action = parsed.action as BlackjackAction;
          } else {
            // 默认策略: <17 要牌, >=17 停牌
            const { calculateHandValue } = await import("./blackjack");
            action = calculateHandValue(currentPlayer.hand) < 17 ? "hit" : "stand";
            logger.warn("AI response parse failed, using default strategy", {
              playerId: currentPlayer.id,
              rawResponse: response.substring(0, 100),
            });
          }
        } else {
          const { calculateHandValue } = await import("./blackjack");
          action = calculateHandValue(currentPlayer.hand) < 17 ? "hit" : "stand";
        }
      } else {
        // 真人玩家 — 目前也用默认策略 (后续可改为等待用户输入)
        const { calculateHandValue } = await import("./blackjack");
        action = calculateHandValue(currentPlayer.hand) < 17 ? "hit" : "stand";
      }

      const { event } = applyBlackjackAction(state, state.currentPlayerIndex, action);

      // 记录动作
      await prisma.gameAction.create({
        data: {
          roundId: gameRound.id,
          playerId: currentPlayer.id,
          action: action.toUpperCase(),
          cards: currentPlayer.hand as unknown as Record<string, unknown>[],
        },
      });

      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "action",
        message: event,
        data: { playerId: currentPlayer.id, action },
      });

      // 短暂延迟以便观战体验
      await new Promise((r) => setTimeout(r, 500));
    }

    // 庄家回合
    const { events: dealerEvents } = playDealerTurn(state);
    for (const e of dealerEvents) {
      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "action",
        message: e,
        data: { dealer: true },
      });
      await new Promise((r) => setTimeout(r, 300));
    }

    // 结算
    const results = settleBlackjackRound(state);
    for (const r of results) {
      // 更新玩家筹码
      const newChips = room.minChips + r.payout; // 返还下注 + 盈亏
      if (newChips > 0) {
        await prisma.gamePlayer.update({
          where: { id: r.playerId },
          data: { chips: { increment: newChips } },
        });
      }

      // 如果是真人玩家, 更新 User credits
      const gp = room.players.find((p) => p.id === r.playerId);
      if (gp && !gp.isAI) {
        if (r.payout !== 0) {
          await prisma.user.update({
            where: { id: gp.userId },
            data: { credits: { increment: r.payout } },
          });
          await prisma.creditLog.create({
            data: {
              userId: gp.userId,
              amount: r.payout,
              balance: (await prisma.user.findUnique({ where: { id: gp.userId } }))!.credits,
              reason: `21点第${roundNum}局 ${r.outcome === "win" ? "赢" : r.outcome === "lose" ? "输" : r.outcome === "blackjack" ? "Blackjack!" : "平局"}`,
            },
          });
        }
      }

      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "result",
        message: `${r.playerName}: ${r.outcome === "win" ? "赢" : r.outcome === "lose" ? "输" : r.outcome === "blackjack" ? "Blackjack!" : "平局"} ${r.payout > 0 ? "+" : ""}${r.payout} 筹码`,
        data: { ...r },
      });
    }

    // 更新 round 记录
    await prisma.gameRound.update({
      where: { id: gameRound.id },
      data: {
        status: "COMPLETED",
        pot: room.minChips * playersForRound.length,
        dealerHand: state.dealer.hand as unknown as Record<string, unknown>[],
        resultLog: results as unknown as Record<string, unknown>[],
        winnerId: results.find((r) => r.outcome === "win" || r.outcome === "blackjack")?.playerId,
      },
    });

    await prisma.gameRoom.update({
      where: { id: roomId },
      data: { currentRound: roundNum },
    });

    // 刷新玩家数据
    const refreshedPlayers = await prisma.gamePlayer.findMany({
      where: { roomId },
      include: { user: true },
      orderBy: { position: "asc" },
    });
    room.players.length = 0;
    room.players.push(...refreshedPlayers);

    pushEvent(roomId, {
      timestamp: Date.now(),
      round: roundNum,
      type: "system",
      message: `第 ${roundNum} 局结束`,
    });

    await new Promise((r) => setTimeout(r, 1000));
  }

  // 游戏结束
  await prisma.gameRoom.update({
    where: { id: roomId },
    data: { status: "COMPLETED" },
  });

  pushEvent(roomId, {
    timestamp: Date.now(),
    round: 0,
    type: "system",
    message: "游戏结束！",
  });

  logger.info("Blackjack game completed", { roomId });
}

// ============================================================
// 德州扑克游戏执行
// ============================================================

export async function executeTexasGame(roomId: string): Promise<void> {
  logger.info("Starting Texas Hold'em game", { roomId });

  const room = await prisma.gameRoom.findUnique({
    where: { id: roomId },
    include: { players: { include: { user: true }, orderBy: { position: "asc" } } },
  });

  if (!room) throw new Error("Room not found");

  let dealerIndex = 0;

  for (let roundNum = 1; roundNum <= room.totalRounds; roundNum++) {
    logger.info("Starting Texas round", { roomId, round: roundNum });

    pushEvent(roomId, {
      timestamp: Date.now(),
      round: roundNum,
      type: "system",
      message: `第 ${roundNum}/${room.totalRounds} 局开始`,
    });

    const activePlayers = room.players.filter((p) => p.status === "ACTIVE");
    if (activePlayers.length < 2) {
      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "system",
        message: "活跃玩家不足，游戏结束",
      });
      break;
    }

    // 检查筹码
    for (const p of activePlayers) {
      if (p.chips < room.minChips) {
        await prisma.gamePlayer.update({ where: { id: p.id }, data: { status: "BUSTED" } });
        p.status = "BUSTED";
        pushEvent(roomId, {
          timestamp: Date.now(),
          round: roundNum,
          type: "system",
          message: `${p.user.name} 筹码不足，退出游戏`,
        });
      }
    }

    const playersForRound = room.players
      .filter((p) => p.status === "ACTIVE")
      .map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        isAI: p.isAI,
        chips: p.chips,
      }));

    if (playersForRound.length < 2) break;

    let state = initTexasRound(playersForRound, room.minChips, dealerIndex % playersForRound.length);

    const gameRound = await prisma.gameRound.create({
      data: {
        roomId,
        roundNumber: roundNum,
      },
    });

    // 发牌事件
    for (const p of state.players) {
      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "deal",
        message: `${p.name} 收到底牌: ${handToString(p.hand)}`,
        data: { playerId: p.id, hand: p.hand },
      });
    }

    // 主循环
    while (state.phase !== "showdown") {
      const currentPlayer = state.players[state.currentPlayerIndex];
      if (currentPlayer.status !== "active") {
        // 跳过
        state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
        continue;
      }

      let action: TexasAction;

      if (currentPlayer.isAI) {
        const token = await getUserToken(currentPlayer.userId);
        if (token) {
          const prompt = buildTexasPrompt(
            currentPlayer,
            state.communityCards,
            state.pot,
            state.currentBet,
            state.phase
          );
          const response = await getAIDecision(token, currentPlayer.userId, prompt);
          const parsed = parseAIResponse(response);
          action = parseTexasAction(parsed, currentPlayer, state);
        } else {
          action = getDefaultTexasAction(currentPlayer, state);
        }
      } else {
        // 真人玩家 — 目前也用默认策略
        action = getDefaultTexasAction(currentPlayer, state);
      }

      const prevPhase = state.phase;
      const { event } = applyTexasAction(state, state.currentPlayerIndex, action);

      await prisma.gameAction.create({
        data: {
          roundId: gameRound.id,
          playerId: currentPlayer.id,
          action: action.type.toUpperCase(),
          amount: "amount" in action ? action.amount : undefined,
          cards: currentPlayer.hand as unknown as Record<string, unknown>[],
        },
      });

      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "action",
        message: event,
        data: { playerId: currentPlayer.id, action: action.type },
      });

      // 阶段变化通知
      if (state.phase !== prevPhase && state.phase !== "showdown") {
        const phaseNames: Record<string, string> = {
          flop: "翻牌",
          turn: "转牌",
          river: "河牌",
        };
        pushEvent(roomId, {
          timestamp: Date.now(),
          round: roundNum,
          type: "phase",
          message: `${phaseNames[state.phase] || state.phase}: ${handToString(state.communityCards)}`,
          data: { phase: state.phase, communityCards: state.communityCards },
        });
      }

      await new Promise((r) => setTimeout(r, 500));
    }

    // 结算
    const results = settleTexasRound(state);

    for (const r of results) {
      // 更新 GamePlayer 筹码
      const gp = room.players.find((p) => p.id === r.playerId)!;
      const newChips = gp.chips + r.payout + (state.players.find((p) => p.id === r.playerId)?.totalBet || 0);
      await prisma.gamePlayer.update({
        where: { id: r.playerId },
        data: { chips: Math.max(0, newChips) },
      });
      gp.chips = Math.max(0, newChips);

      // 真人玩家 credit 更新
      if (!gp.isAI && r.payout !== 0) {
        await prisma.user.update({
          where: { id: gp.userId },
          data: { credits: { increment: r.payout } },
        });
        await prisma.creditLog.create({
          data: {
            userId: gp.userId,
            amount: r.payout,
            balance: (await prisma.user.findUnique({ where: { id: gp.userId } }))!.credits,
            reason: `德州扑克第${roundNum}局 ${r.outcome === "win" ? "赢" : r.outcome === "split" ? "平分" : "输"}`,
          },
        });
      }

      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "result",
        message: `${r.playerName} [${r.handRank}]: ${r.payout > 0 ? "+" : ""}${r.payout} 筹码`,
        data: { ...r },
      });
    }

    await prisma.gameRound.update({
      where: { id: gameRound.id },
      data: {
        status: "COMPLETED",
        pot: state.pot,
        communityCards: state.communityCards as unknown as Record<string, unknown>[],
        resultLog: results as unknown as Record<string, unknown>[],
        winnerId: results.find((r) => r.outcome === "win")?.playerId,
      },
    });

    await prisma.gameRoom.update({
      where: { id: roomId },
      data: { currentRound: roundNum },
    });

    // 刷新
    const refreshedPlayers = await prisma.gamePlayer.findMany({
      where: { roomId },
      include: { user: true },
      orderBy: { position: "asc" },
    });
    room.players.length = 0;
    room.players.push(...refreshedPlayers);

    dealerIndex++;

    pushEvent(roomId, {
      timestamp: Date.now(),
      round: roundNum,
      type: "system",
      message: `第 ${roundNum} 局结束`,
    });

    await new Promise((r) => setTimeout(r, 1000));
  }

  await prisma.gameRoom.update({
    where: { id: roomId },
    data: { status: "COMPLETED" },
  });

  pushEvent(roomId, {
    timestamp: Date.now(),
    round: 0,
    type: "system",
    message: "游戏结束！",
  });

  logger.info("Texas Hold'em game completed", { roomId });
}

function parseTexasAction(
  parsed: Record<string, unknown> | null,
  player: { chips: number; currentBet: number },
  state: TexasState
): TexasAction {
  if (!parsed) return getDefaultTexasAction(player, state);

  const actionType = String(parsed.action || "").toLowerCase();
  switch (actionType) {
    case "fold":
      return { type: "fold" };
    case "call":
      return { type: "call" };
    case "check":
      if (state.currentBet === player.currentBet) return { type: "check" };
      return { type: "call" }; // 不能check就call
    case "raise": {
      const amount = Number(parsed.amount) || state.currentBet * 2;
      return { type: "raise", amount: Math.min(amount, player.chips + player.currentBet) };
    }
    case "all_in":
      return { type: "all_in" };
    default:
      return getDefaultTexasAction(player, state);
  }
}

function getDefaultTexasAction(
  player: { chips: number; currentBet: number },
  state: TexasState
): TexasAction {
  const callAmount = state.currentBet - player.currentBet;
  if (callAmount === 0) return { type: "check" };
  if (callAmount <= player.chips * 0.3) return { type: "call" };
  // 下注太高就弃牌
  return { type: "fold" };
}
