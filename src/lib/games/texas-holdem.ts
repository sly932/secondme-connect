// 德州扑克游戏引擎

import { Card, createDeck, shuffle, handToString } from "./deck";
import logger from "../logger";

export interface TexasPlayer {
  id: string;        // GamePlayer ID
  userId: string;
  name: string;
  isAI: boolean;
  hand: Card[];      // 两张底牌
  chips: number;
  currentBet: number; // 本轮已下注
  totalBet: number;   // 本局总下注
  status: "active" | "folded" | "all_in";
}

export interface TexasState {
  deck: Card[];
  communityCards: Card[];
  players: TexasPlayer[];
  pot: number;
  currentPlayerIndex: number;
  currentBet: number;       // 当前最高下注
  smallBlind: number;
  bigBlind: number;
  dealerIndex: number;
  phase: "preflop" | "flop" | "turn" | "river" | "showdown";
  lastRaiseIndex: number;   // 最后加注的玩家
}

export type TexasAction =
  | { type: "fold" }
  | { type: "call" }
  | { type: "raise"; amount: number }
  | { type: "check" }
  | { type: "all_in" };

// 牌型等级
enum HandRank {
  HIGH_CARD = 0,
  ONE_PAIR = 1,
  TWO_PAIR = 2,
  THREE_OF_A_KIND = 3,
  STRAIGHT = 4,
  FLUSH = 5,
  FULL_HOUSE = 6,
  FOUR_OF_A_KIND = 7,
  STRAIGHT_FLUSH = 8,
  ROYAL_FLUSH = 9,
}

const RANK_VALUES: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
  "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
};

export function initTexasRound(
  players: { id: string; userId: string; name: string; isAI: boolean; chips: number }[],
  minChips: number,
  dealerIndex: number
): TexasState {
  logger.info("Initializing Texas Hold'em round", { playerCount: players.length, minChips });

  const deck = shuffle(createDeck());
  const smallBlind = Math.floor(minChips / 2) || 1;
  const bigBlind = minChips;

  const txPlayers: TexasPlayer[] = players.map((p) => ({
    ...p,
    hand: [],
    currentBet: 0,
    totalBet: 0,
    status: "active" as const,
  }));

  // 发底牌
  for (let i = 0; i < 2; i++) {
    for (const p of txPlayers) {
      p.hand.push(deck.pop()!);
    }
  }

  // 小盲大盲
  const sbIndex = (dealerIndex + 1) % txPlayers.length;
  const bbIndex = (dealerIndex + 2) % txPlayers.length;

  const sbPlayer = txPlayers[sbIndex];
  const actualSB = Math.min(smallBlind, sbPlayer.chips);
  sbPlayer.chips -= actualSB;
  sbPlayer.currentBet = actualSB;
  sbPlayer.totalBet = actualSB;

  const bbPlayer = txPlayers[bbIndex];
  const actualBB = Math.min(bigBlind, bbPlayer.chips);
  bbPlayer.chips -= actualBB;
  bbPlayer.currentBet = actualBB;
  bbPlayer.totalBet = actualBB;

  const pot = actualSB + actualBB;

  // UTG (大盲后一位) 先行动
  let firstActor = (bbIndex + 1) % txPlayers.length;

  logger.debug("Blinds posted", {
    smallBlind: { player: sbPlayer.name, amount: actualSB },
    bigBlind: { player: bbPlayer.name, amount: actualBB },
  });

  return {
    deck,
    communityCards: [],
    players: txPlayers,
    pot,
    currentPlayerIndex: firstActor,
    currentBet: actualBB,
    smallBlind,
    bigBlind,
    dealerIndex,
    phase: "preflop",
    lastRaiseIndex: bbIndex,
  };
}

function getActivePlayers(state: TexasState): TexasPlayer[] {
  return state.players.filter((p) => p.status === "active");
}

function getNotFoldedPlayers(state: TexasState): TexasPlayer[] {
  return state.players.filter((p) => p.status !== "folded");
}

export function applyTexasAction(
  state: TexasState,
  playerIndex: number,
  action: TexasAction
): { state: TexasState; event: string } {
  const player = state.players[playerIndex];

  switch (action.type) {
    case "fold": {
      player.status = "folded";
      const event = `${player.name} 弃牌`;
      logger.debug("Player folds", { playerId: player.id });

      // 检查是否只剩一个人
      const remaining = getNotFoldedPlayers(state);
      if (remaining.length === 1) {
        state.phase = "showdown";
        return { state, event };
      }

      advanceTexasPlayer(state);
      return { state, event };
    }

    case "call": {
      const callAmount = Math.min(state.currentBet - player.currentBet, player.chips);
      player.chips -= callAmount;
      player.currentBet += callAmount;
      player.totalBet += callAmount;
      state.pot += callAmount;

      if (player.chips === 0) player.status = "all_in";

      const event = `${player.name} 跟注 ${callAmount}`;
      logger.debug("Player calls", { playerId: player.id, amount: callAmount });
      advanceTexasPlayer(state);
      return { state, event };
    }

    case "raise": {
      const raiseTotal = action.amount;
      const raiseAmount = Math.min(raiseTotal - player.currentBet, player.chips);
      player.chips -= raiseAmount;
      player.currentBet += raiseAmount;
      player.totalBet += raiseAmount;
      state.pot += raiseAmount;
      state.currentBet = player.currentBet;
      state.lastRaiseIndex = playerIndex;

      if (player.chips === 0) player.status = "all_in";

      const event = `${player.name} 加注到 ${player.currentBet}`;
      logger.debug("Player raises", { playerId: player.id, amount: raiseAmount, total: player.currentBet });
      advanceTexasPlayer(state);
      return { state, event };
    }

    case "check": {
      const event = `${player.name} 过牌`;
      logger.debug("Player checks", { playerId: player.id });
      advanceTexasPlayer(state);
      return { state, event };
    }

    case "all_in": {
      const allInAmount = player.chips;
      player.currentBet += allInAmount;
      player.totalBet += allInAmount;
      state.pot += allInAmount;
      player.chips = 0;
      player.status = "all_in";

      if (player.currentBet > state.currentBet) {
        state.currentBet = player.currentBet;
        state.lastRaiseIndex = playerIndex;
      }

      const event = `${player.name} ALL IN ${allInAmount}`;
      logger.debug("Player all-in", { playerId: player.id, amount: allInAmount });
      advanceTexasPlayer(state);
      return { state, event };
    }
  }
}

function advanceTexasPlayer(state: TexasState): void {
  const activePlayers = getActivePlayers(state);
  if (activePlayers.length <= 1) {
    state.phase = "showdown";
    return;
  }

  let nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
  let checked = 0;

  while (checked < state.players.length) {
    const p = state.players[nextIndex];
    if (p.status === "active") {
      // 如果回到了最后加注的人，且所有人已匹配下注 → 进入下一阶段
      if (nextIndex === state.lastRaiseIndex) {
        advancePhase(state);
        return;
      }
      state.currentPlayerIndex = nextIndex;
      return;
    }
    nextIndex = (nextIndex + 1) % state.players.length;
    checked++;
  }

  // 没有活跃玩家了
  state.phase = "showdown";
}

function advancePhase(state: TexasState): void {
  // 重置每轮下注
  for (const p of state.players) {
    p.currentBet = 0;
  }
  state.currentBet = 0;

  switch (state.phase) {
    case "preflop":
      state.phase = "flop";
      state.communityCards.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
      logger.info("Flop dealt", { cards: handToString(state.communityCards) });
      break;
    case "flop":
      state.phase = "turn";
      state.communityCards.push(state.deck.pop()!);
      logger.info("Turn dealt", { card: handToString(state.communityCards) });
      break;
    case "turn":
      state.phase = "river";
      state.communityCards.push(state.deck.pop()!);
      logger.info("River dealt", { card: handToString(state.communityCards) });
      break;
    case "river":
      state.phase = "showdown";
      logger.info("Showdown phase");
      return;
  }

  // 设置第一个行动玩家 (庄家后第一个活跃玩家)
  let idx = (state.dealerIndex + 1) % state.players.length;
  for (let i = 0; i < state.players.length; i++) {
    if (state.players[idx].status === "active") {
      state.currentPlayerIndex = idx;
      state.lastRaiseIndex = idx; // 第一个行动者也是回合结束标记
      break;
    }
    idx = (idx + 1) % state.players.length;
  }
}

/** 评估最佳5张牌组合 */
export function evaluateHand(holeCards: Card[], communityCards: Card[]): { rank: HandRank; value: number; name: string } {
  const allCards = [...holeCards, ...communityCards];
  const combos = getCombinations(allCards, 5);

  let bestRank = HandRank.HIGH_CARD;
  let bestValue = 0;
  let bestName = "高牌";

  for (const combo of combos) {
    const { rank, value, name } = evaluateFiveCards(combo);
    if (rank > bestRank || (rank === bestRank && value > bestValue)) {
      bestRank = rank;
      bestValue = value;
      bestName = name;
    }
  }

  return { rank: bestRank, value: bestValue, name: bestName };
}

function getCombinations(arr: Card[], k: number): Card[][] {
  const result: Card[][] = [];
  function combine(start: number, current: Card[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      combine(i + 1, current);
      current.pop();
    }
  }
  combine(0, []);
  return result;
}

function evaluateFiveCards(cards: Card[]): { rank: HandRank; value: number; name: string } {
  const values = cards.map((c) => RANK_VALUES[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);
  const isStraight = checkStraight(values);

  // 计数
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const countEntries = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  if (isFlush && isStraight) {
    if (values[0] === 14 && values[1] === 13) {
      return { rank: HandRank.ROYAL_FLUSH, value: 14, name: "皇家同花顺" };
    }
    return { rank: HandRank.STRAIGHT_FLUSH, value: values[0], name: "同花顺" };
  }
  if (countEntries[0].count === 4) {
    return { rank: HandRank.FOUR_OF_A_KIND, value: countEntries[0].value, name: "四条" };
  }
  if (countEntries[0].count === 3 && countEntries[1].count === 2) {
    return { rank: HandRank.FULL_HOUSE, value: countEntries[0].value, name: "葫芦" };
  }
  if (isFlush) {
    return { rank: HandRank.FLUSH, value: values[0], name: "同花" };
  }
  if (isStraight) {
    return { rank: HandRank.STRAIGHT, value: values[0], name: "顺子" };
  }
  if (countEntries[0].count === 3) {
    return { rank: HandRank.THREE_OF_A_KIND, value: countEntries[0].value, name: "三条" };
  }
  if (countEntries[0].count === 2 && countEntries[1].count === 2) {
    return { rank: HandRank.TWO_PAIR, value: Math.max(countEntries[0].value, countEntries[1].value), name: "两对" };
  }
  if (countEntries[0].count === 2) {
    return { rank: HandRank.ONE_PAIR, value: countEntries[0].value, name: "一对" };
  }
  return { rank: HandRank.HIGH_CARD, value: values[0], name: "高牌" };
}

function checkStraight(sortedValues: number[]): boolean {
  // 正常顺子
  for (let i = 0; i < sortedValues.length - 1; i++) {
    if (sortedValues[i] - sortedValues[i + 1] !== 1) {
      // 检查 A-2-3-4-5
      if (i === 0 && sortedValues[0] === 14 && sortedValues[1] === 5) continue;
      return false;
    }
  }
  return true;
}

export interface TexasResult {
  playerId: string;
  playerName: string;
  hand: Card[];
  handRank: string;
  payout: number;
  outcome: "win" | "lose" | "split";
}

export function settleTexasRound(state: TexasState): TexasResult[] {
  const notFolded = getNotFoldedPlayers(state);

  // 只剩一人直接赢
  if (notFolded.length === 1) {
    const winner = notFolded[0];
    const payout = state.pot - winner.totalBet;

    logger.info("Texas round settled (last player standing)", {
      winner: winner.name,
      pot: state.pot,
    });

    return state.players.map((p) => ({
      playerId: p.id,
      playerName: p.name,
      hand: p.hand,
      handRank: p.status === "folded" ? "弃牌" : "获胜",
      payout: p.id === winner.id ? payout : -p.totalBet,
      outcome: p.id === winner.id ? "win" as const : "lose" as const,
    }));
  }

  // 评估牌力
  const evaluations = notFolded.map((p) => ({
    player: p,
    ...evaluateHand(p.hand, state.communityCards),
  }));
  evaluations.sort((a, b) => b.rank - a.rank || b.value - a.value);

  const bestRank = evaluations[0].rank;
  const bestValue = evaluations[0].value;
  const winners = evaluations.filter((e) => e.rank === bestRank && e.value === bestValue);

  const splitPot = Math.floor(state.pot / winners.length);

  logger.info("Texas round settled", {
    winners: winners.map((w) => w.player.name),
    pot: state.pot,
    bestHand: evaluations[0].name,
  });

  return state.players.map((p) => {
    const evaluation = evaluations.find((e) => e.player.id === p.id);
    const isWinner = winners.some((w) => w.player.id === p.id);

    if (p.status === "folded") {
      return {
        playerId: p.id,
        playerName: p.name,
        hand: p.hand,
        handRank: "弃牌",
        payout: -p.totalBet,
        outcome: "lose" as const,
      };
    }

    return {
      playerId: p.id,
      playerName: p.name,
      hand: p.hand,
      handRank: evaluation?.name || "未知",
      payout: isWinner ? splitPot - p.totalBet : -p.totalBet,
      outcome: isWinner
        ? winners.length > 1 ? "split" as const : "win" as const
        : "lose" as const,
    };
  });
}

/** 构建 AI 决策提示词 */
export function buildTexasPrompt(
  player: TexasPlayer,
  communityCards: Card[],
  pot: number,
  currentBet: number,
  phase: string
): string {
  const handStr = handToString(player.hand);
  const communityStr = communityCards.length > 0 ? handToString(communityCards) : "无";
  const callAmount = currentBet - player.currentBet;

  return `你正在玩德州扑克。

当前阶段: ${phase === "preflop" ? "翻牌前" : phase === "flop" ? "翻牌" : phase === "turn" ? "转牌" : "河牌"}
你的底牌: ${handStr}
公共牌: ${communityStr}
底池: ${pot}
当前最高下注: ${currentBet}
你已下注: ${player.currentBet}
需要跟注: ${callAmount}
你的筹码: ${player.chips}

可选操作:
${callAmount === 0 ? '- {"action": "check"} 过牌' : ""}
${callAmount > 0 ? `- {"action": "call"} 跟注 ${callAmount}` : ""}
- {"action": "fold"} 弃牌
- {"action": "raise", "amount": <总下注额>} 加注（总额需大于 ${currentBet * 2}）
- {"action": "all_in"} 全押

请做出你的决定，回答一个JSON，包含你的思考过程和决定。例如:
{"thinking": "你的思考过程（简短一句话，用你的风格）", "action": "call"}

只输出JSON，不要输出其他内容。`;
}
