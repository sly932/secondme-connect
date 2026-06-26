// 游戏执行器 — 驱动完整游戏流程，调用 SecondMe Chat 获取 AI 决策

import prisma from "../prisma";
import logger from "../logger";
import { chatStream } from "../secondme";
import { adjustCredits } from "../credits";
import { Prisma } from "@prisma/client";
import {
  initBlackjackRound,
  applyBlackjackAction,
  playDealerTurn,
  settleBlackjackRound,
  buildBlackjackPrompt,
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

/** 构建玩家 system prompt */
function buildPlayerSystemPrompt(name: string, bio: string | null): string {
  if (bio) {
    return [
      `## 角色`,
      `你是「${name}」— ${bio}`,
      ``,
      `## 要求`,
      `- 以「${name}」的性格和思维方式做决定`,
      `- 根据你角色的实际经验和直觉来判断`,
      ``,
      `## 输出格式`,
      `- 只输出 JSON，不要输出其他任何内容`,
    ].join("\n");
  }
  return [
    `请根据你的实际经验和直觉来做游戏决定。`,
    ``,
    `## 输出格式`,
    `- 只输出 JSON，不要输出其他任何内容`,
  ].join("\n");
}

// 全局事件存储 (roomId -> events[])
const roomEvents: Map<string, GameEvent[]> = new Map();
const roomEventCleanupTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const MAX_EVENTS_PER_ROOM = 500;
const ROOM_EVENT_TTL_MS = 5 * 60 * 1000;

function toJsonArray(value: unknown): Prisma.InputJsonArray {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonArray;
}

function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

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
  const events = roomEvents.get(roomId)!;
  events.push(event);
  if (events.length > MAX_EVENTS_PER_ROOM) {
    events.splice(0, events.length - MAX_EVENTS_PER_ROOM);
  }
}

function resetRoomEvents(roomId: string) {
  roomEvents.set(roomId, []);
  const cleanupTimer = roomEventCleanupTimers.get(roomId);
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    roomEventCleanupTimers.delete(roomId);
  }
}

function scheduleRoomEventCleanup(roomId: string) {
  const existingTimer = roomEventCleanupTimers.get(roomId);
  if (existingTimer) clearTimeout(existingTimer);

  const timer = setTimeout(() => {
    roomEvents.delete(roomId);
    roomEventCleanupTimers.delete(roomId);
  }, ROOM_EVENT_TTL_MS);

  roomEventCleanupTimers.set(roomId, timer);
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
const AI_DECISION_TIMEOUT = 15000; // 15 秒超时

async function getAIDecision(
  accessToken: string,
  targetUserId: string,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  try {
    const result = await Promise.race([
      (async () => {
        const stream = await chatStream(accessToken, targetUserId, prompt, systemPrompt);
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let rawResult = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          rawResult += decoder.decode(value, { stream: true });
        }

        return rawResult;
      })(),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("AI decision timeout")), AI_DECISION_TIMEOUT)
      ),
    ]);

    // 从 SSE 流中提取实际文本
    const text = extractTextFromSSE(result);

    logger.debug("AI decision parsed", {
      targetUserId,
      rawLength: result.length,
      extractedText: text.substring(0, 200),
    });

    return text || result; // fallback to raw if extraction yields nothing
  } catch (error) {
    logger.error("AI decision call failed", { targetUserId, error: String(error) });
    return "";
  }
}

/** 获取用户的有效 access token (自动刷新) */
async function getUserToken(userId: string): Promise<string | null> {
  try {
    const { getValidAccessToken } = await import("../secondme");
    return await getValidAccessToken(userId);
  } catch {
    logger.error("Failed to get valid token for game AI", { userId });
    return null;
  }
}

// ============================================================
// 21点游戏执行
// ============================================================

export async function executeBlackjackGame(roomId: string): Promise<void> {
  logger.info("Starting Blackjack game", { roomId });
  resetRoomEvents(roomId);

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
    const state = initBlackjackRound(playersForRound, room.minChips);

    // 创建 GameRound 记录
    const gameRound = await prisma.gameRound.create({
      data: {
        roomId,
        roundNumber: roundNum,
        dealerHand: toJsonArray(state.dealer.hand),
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

      let thinking = "";

      // 所有玩家（AI 和真人）都通过 SecondMe 分身做决策
      const token = await getUserToken(currentPlayer.userId);
      if (token) {
        const prompt = buildBlackjackPrompt(currentPlayer, state.dealer.hand[0]);
        const playerUser = room.players.find((p) => p.id === currentPlayer.id)?.user;
        const systemPrompt = playerUser ? buildPlayerSystemPrompt(playerUser.name, playerUser.bio) : undefined;
        const response = await getAIDecision(token, currentPlayer.userId, prompt, systemPrompt);
        const parsed = parseAIResponse(response);

        if (parsed && (parsed.action === "hit" || parsed.action === "stand")) {
          action = parsed.action as BlackjackAction;
          thinking = (parsed.thinking as string) || "";
        } else {
          const { calculateHandValue } = await import("./blackjack");
          action = calculateHandValue(currentPlayer.hand) < 17 ? "hit" : "stand";
          logger.warn("AI response parse failed, using default strategy", {
            playerId: currentPlayer.id,
            rawResponse: response.substring(0, 100),
          });
        }
      } else {
        // 无 token 时用默认策略
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
          cards: toJsonArray(currentPlayer.hand),
        },
      });

      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "action",
        message: event,
        data: { playerId: currentPlayer.id, action, hand: currentPlayer.hand, thinking: thinking || undefined, playerName: currentPlayer.name },
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
        data: { dealer: true, dealerHand: state.dealer.hand },
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
          await adjustCredits(
            gp.userId,
            r.payout,
            `21点第${roundNum}局 ${r.outcome === "win" ? "赢" : r.outcome === "lose" ? "输" : r.outcome === "blackjack" ? "Blackjack!" : "平局"}`
          );
        }
      }

      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "result",
        message: `${r.playerName} [${r.handValue}点${r.outcome === "blackjack" ? " Blackjack" : ""}]: ${r.outcome === "win" ? "赢" : r.outcome === "lose" ? "输" : r.outcome === "blackjack" ? "Blackjack!" : "平局"} ${r.payout > 0 ? "+" : ""}${r.payout} 筹码`,
        data: { ...r },
      });
    }

    // 构建结构化快照
    const roundSnapshot = {
      round: roundNum,
      gameType: "BLACKJACK",
      pot: room.minChips * playersForRound.length,
      dealer: { hand: state.dealer.hand },
      players: state.players.map((p) => {
        const result = results.find((r) => r.playerId === p.id);
        return {
          id: p.id,
          name: p.name,
          initialHand: p.hand.slice(0, 2),
          finalHand: p.hand,
          outcome: result?.outcome || "unknown",
          payout: result?.payout || 0,
          handRank: result ? `${result.handValue}点${result.outcome === "blackjack" ? " Blackjack" : result.outcome === "lose" && p.status === "busted" ? " 爆牌" : ""}` : "",
          chipsAfter: (room.players.find((rp) => rp.id === p.id)?.chips || 0) + (result?.payout || 0) + room.minChips,
        };
      }),
      actions: getRoomEvents(roomId)
        .filter((e) => e.round === roundNum && (e.type === "action" || e.type === "deal"))
        .map((e, seq) => ({ seq, type: e.type, message: e.message, data: e.data })),
    };

    // 更新 round 记录
    await prisma.gameRound.update({
      where: { id: gameRound.id },
      data: {
        status: "COMPLETED",
        pot: room.minChips * playersForRound.length,
        dealerHand: toJsonArray(state.dealer.hand),
        resultLog: toJsonArray(results),
        roundSnapshot: toJsonObject(roundSnapshot),
        winnerId: results.find((r) => r.outcome === "win" || r.outcome === "blackjack")?.playerId,
      },
    });

    await prisma.gameRoom.update({
      where: { id: roomId },
      data: { currentRound: roundNum },
    });

    // 刷新玩家数据
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
  scheduleRoomEventCleanup(roomId);

  logger.info("Blackjack game completed", { roomId });
}

// ============================================================
// 德州扑克游戏执行
// ============================================================

export async function executeTexasGame(roomId: string): Promise<void> {
  logger.info("Starting Texas Hold'em game", { roomId });
  resetRoomEvents(roomId);

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

    const actualDealerIndex = dealerIndex % playersForRound.length;
    const state = initTexasRound(playersForRound, room.minChips, actualDealerIndex);

    // 推送盲注信息事件
    const sbIdx = (actualDealerIndex + 1) % playersForRound.length;
    const bbIdx = (actualDealerIndex + 2) % playersForRound.length;
    pushEvent(roomId, {
      timestamp: Date.now(),
      round: roundNum,
      type: "phase",
      message: `庄家: ${playersForRound[actualDealerIndex].name} · 小盲 ${state.smallBlind}: ${playersForRound[sbIdx].name} · 大盲 ${state.bigBlind}: ${playersForRound[bbIdx].name}`,
      data: {
        dealerIndex: actualDealerIndex,
        sbIndex: sbIdx,
        bbIndex: bbIdx,
        smallBlind: state.smallBlind,
        bigBlind: state.bigBlind,
        dealerPlayerId: playersForRound[actualDealerIndex].id,
        sbPlayerId: playersForRound[sbIdx].id,
        bbPlayerId: playersForRound[bbIdx].id,
      },
    });

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
    let loopGuard = 0;
    while (state.phase !== "showdown") {
      // 安全阀：防止无限循环
      if (++loopGuard > state.players.length * 50) {
        logger.error("Texas main loop exceeded safety limit", { roomId, round: roundNum });
        state.phase = "showdown" as TexasState["phase"];
        break;
      }

      const currentPlayer = state.players[state.currentPlayerIndex];
      if (currentPlayer.status !== "active") {
        state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
        continue;
      }

      let action: TexasAction;
      let thinking = "";

      // 所有玩家（AI 和真人）都通过 SecondMe 分身做决策
      const token = await getUserToken(currentPlayer.userId);
      if (token) {
        const prompt = buildTexasPrompt(
          currentPlayer,
          state.communityCards,
          state.pot,
          state.currentBet,
          state.phase
        );
        const playerUser = room.players.find((p) => p.id === currentPlayer.id)?.user;
        const systemPrompt = playerUser ? buildPlayerSystemPrompt(playerUser.name, playerUser.bio) : undefined;
        const response = await getAIDecision(token, currentPlayer.userId, prompt, systemPrompt);
        const parsed = parseAIResponse(response);
        thinking = (parsed?.thinking as string) || "";
        action = parseTexasAction(parsed, currentPlayer, state);
      } else {
        // 无 token 时用默认策略
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
          cards: toJsonArray(currentPlayer.hand),
        },
      });

      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "action",
        message: event,
        data: { playerId: currentPlayer.id, action: action.type, hand: currentPlayer.hand, thinking: thinking || undefined, playerName: currentPlayer.name },
      });

      // 阶段变化通知
      if (state.phase !== prevPhase && (state.phase === "flop" || state.phase === "turn" || state.phase === "river")) {
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
        await adjustCredits(
          gp.userId,
          r.payout,
          `德州扑克第${roundNum}局 ${r.outcome === "win" ? "赢" : r.outcome === "split" ? "平分" : "输"}`
        );
      }

      pushEvent(roomId, {
        timestamp: Date.now(),
        round: roundNum,
        type: "result",
        message: `${r.playerName} [${r.handRank}]: ${r.payout > 0 ? "+" : ""}${r.payout} 筹码`,
        data: { ...r },
      });
    }

    // 构建结构化快照
    const roundSnapshot = {
      round: roundNum,
      gameType: "TEXAS_HOLDEM",
      pot: state.pot,
      communityCards: state.communityCards,
      dealerIndex: actualDealerIndex,
      smallBlind: state.smallBlind,
      bigBlind: state.bigBlind,
      players: state.players.map((p) => {
        const result = results.find((r) => r.playerId === p.id);
        const gp = room.players.find((rp) => rp.id === p.id);
        return {
          id: p.id,
          name: p.name,
          hand: p.hand,
          status: p.status,
          totalBet: p.totalBet,
          outcome: result?.outcome || "unknown",
          payout: result?.payout || 0,
          handRank: result?.handRank || "",
          chipsAfter: gp?.chips || 0,
        };
      }),
      actions: getRoomEvents(roomId)
        .filter((e) => e.round === roundNum && (e.type === "action" || e.type === "deal" || e.type === "phase"))
        .map((e, seq) => ({ seq, type: e.type, message: e.message, data: e.data })),
    };

    await prisma.gameRound.update({
      where: { id: gameRound.id },
      data: {
        status: "COMPLETED",
        pot: state.pot,
        communityCards: toJsonArray(state.communityCards),
        resultLog: toJsonArray(results),
        roundSnapshot: toJsonObject(roundSnapshot),
        winnerId: results.find((r) => r.outcome === "win")?.playerId,
      },
    });

    await prisma.gameRoom.update({
      where: { id: roomId },
      data: { currentRound: roundNum },
    });

    // 刷新
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
  scheduleRoomEventCleanup(roomId);

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
