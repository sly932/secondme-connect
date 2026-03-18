// 21点游戏引擎

import { Card, createDeck, shuffle, cardValue, handToString } from "./deck";
import logger from "../logger";

export interface BlackjackPlayer {
  id: string;        // GamePlayer ID
  userId: string;
  name: string;
  isAI: boolean;
  hand: Card[];
  chips: number;
  bet: number;
  status: "playing" | "stand" | "busted" | "blackjack";
}

export interface BlackjackState {
  deck: Card[];
  dealer: { hand: Card[]; status: "playing" | "stand" | "busted" | "blackjack" };
  players: BlackjackPlayer[];
  currentPlayerIndex: number;
  phase: "betting" | "dealing" | "player_turns" | "dealer_turn" | "settlement";
}

export type BlackjackAction = "hit" | "stand";

export function calculateHandValue(hand: Card[]): number {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    const v = cardValue(card);
    if (v === 11) aces++;
    value += v;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && calculateHandValue(hand) === 21;
}

export function initBlackjackRound(
  players: { id: string; userId: string; name: string; isAI: boolean; chips: number }[],
  minBet: number
): BlackjackState {
  logger.info("Initializing Blackjack round", { playerCount: players.length, minBet });

  const deck = shuffle(createDeck());

  const bjPlayers: BlackjackPlayer[] = players.map((p) => ({
    ...p,
    hand: [],
    bet: minBet,
    status: "playing" as const,
  }));

  // 发两轮牌
  for (let round = 0; round < 2; round++) {
    for (const player of bjPlayers) {
      player.hand.push(deck.pop()!);
    }
  }

  const dealerHand: Card[] = [deck.pop()!, deck.pop()!];

  // 检查天然21点
  for (const player of bjPlayers) {
    if (isBlackjack(player.hand)) {
      player.status = "blackjack";
      logger.info("Player has blackjack", { playerId: player.id, hand: handToString(player.hand) });
    }
  }

  const state: BlackjackState = {
    deck,
    dealer: {
      hand: dealerHand,
      status: isBlackjack(dealerHand) ? "blackjack" : "playing",
    },
    players: bjPlayers,
    currentPlayerIndex: 0,
    phase: "player_turns",
  };

  // 跳过已经 blackjack 的玩家
  advanceToNextActivePlayer(state);

  return state;
}

function advanceToNextActivePlayer(state: BlackjackState): void {
  while (
    state.currentPlayerIndex < state.players.length &&
    state.players[state.currentPlayerIndex].status !== "playing"
  ) {
    state.currentPlayerIndex++;
  }
  if (state.currentPlayerIndex >= state.players.length) {
    state.phase = "dealer_turn";
  }
}

export function applyBlackjackAction(
  state: BlackjackState,
  playerIndex: number,
  action: BlackjackAction
): { state: BlackjackState; event: string } {
  const player = state.players[playerIndex];

  if (action === "hit") {
    const card = state.deck.pop()!;
    player.hand.push(card);
    const value = calculateHandValue(player.hand);
    logger.debug("Player hits", {
      playerId: player.id,
      card: `${card.suit}${card.rank}`,
      handValue: value,
    });

    if (value > 21) {
      player.status = "busted";
      state.currentPlayerIndex++;
      advanceToNextActivePlayer(state);
      return {
        state,
        event: `${player.name} 要牌 ${card.suit}${card.rank}，手牌点数 ${value}，爆牌！`,
      };
    }
    if (value === 21) {
      player.status = "stand";
      state.currentPlayerIndex++;
      advanceToNextActivePlayer(state);
      return {
        state,
        event: `${player.name} 要牌 ${card.suit}${card.rank}，手牌点数 21，自动停牌`,
      };
    }

    return {
      state,
      event: `${player.name} 要牌 ${card.suit}${card.rank}，手牌点数 ${value}`,
    };
  }

  // stand
  player.status = "stand";
  state.currentPlayerIndex++;
  advanceToNextActivePlayer(state);
  logger.debug("Player stands", {
    playerId: player.id,
    handValue: calculateHandValue(player.hand),
  });

  return {
    state,
    event: `${player.name} 停牌，手牌点数 ${calculateHandValue(player.hand)}`,
  };
}

export function playDealerTurn(state: BlackjackState): { state: BlackjackState; events: string[] } {
  const events: string[] = [];
  const dealer = state.dealer;

  logger.info("Dealer turn starts", { hand: handToString(dealer.hand) });

  // 庄家策略: 小于17必须要牌
  while (calculateHandValue(dealer.hand) < 17) {
    const card = state.deck.pop()!;
    dealer.hand.push(card);
    const value = calculateHandValue(dealer.hand);
    events.push(`庄家 要牌 ${card.suit}${card.rank}，点数 ${value}`);
    logger.debug("Dealer hits", { card: `${card.suit}${card.rank}`, value });
  }

  const finalValue = calculateHandValue(dealer.hand);
  if (finalValue > 21) {
    dealer.status = "busted";
    events.push(`庄家 爆牌！点数 ${finalValue}`);
  } else {
    dealer.status = "stand";
    events.push(`庄家 停牌，最终点数 ${finalValue}`);
  }

  state.phase = "settlement";
  return { state, events };
}

export interface BlackjackResult {
  playerId: string;
  playerName: string;
  hand: Card[];
  handValue: number;
  bet: number;
  payout: number;        // 赢得的筹码 (净收益, 负数为输)
  outcome: "win" | "lose" | "push" | "blackjack";
}

export function settleBlackjackRound(state: BlackjackState): BlackjackResult[] {
  const dealerValue = calculateHandValue(state.dealer.hand);
  const dealerBusted = state.dealer.status === "busted";
  const dealerBlackjack = state.dealer.status === "blackjack";
  const results: BlackjackResult[] = [];

  for (const player of state.players) {
    const playerValue = calculateHandValue(player.hand);
    let outcome: BlackjackResult["outcome"];
    let payout: number;

    if (player.status === "busted") {
      outcome = "lose";
      payout = -player.bet;
    } else if (player.status === "blackjack") {
      if (dealerBlackjack) {
        outcome = "push";
        payout = 0;
      } else {
        outcome = "blackjack";
        payout = Math.floor(player.bet * 1.5); // 3:2 赔率
      }
    } else if (dealerBusted) {
      outcome = "win";
      payout = player.bet;
    } else if (playerValue > dealerValue) {
      outcome = "win";
      payout = player.bet;
    } else if (playerValue < dealerValue) {
      outcome = "lose";
      payout = -player.bet;
    } else {
      outcome = "push";
      payout = 0;
    }

    results.push({
      playerId: player.id,
      playerName: player.name,
      hand: player.hand,
      handValue: playerValue,
      bet: player.bet,
      payout,
      outcome,
    });

    logger.info("Blackjack result", {
      player: player.name,
      handValue: playerValue,
      outcome,
      payout,
    });
  }

  return results;
}

/** 构建 AI 决策提示词 */
export function buildBlackjackPrompt(
  player: BlackjackPlayer,
  dealerUpCard: Card
): string {
  const handStr = handToString(player.hand);
  const handValue = calculateHandValue(player.hand);
  return `你正在玩21点游戏。

你的手牌: ${handStr} (点数: ${handValue})
庄家明牌: ${dealerUpCard.suit}${dealerUpCard.rank}

规则: 手牌点数越接近21点越好，超过21点则爆牌。A可以算1或11。
庄家必须在16点及以下要牌，17点及以上停牌。

请做出你的决定，只需回答一个JSON:
{"action": "hit"} 表示要牌
{"action": "stand"} 表示停牌

只输出JSON，不要输出其他内容。`;
}
