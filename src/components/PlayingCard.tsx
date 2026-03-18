"use client";

interface PlayingCardProps {
  suit: string;
  rank: string;
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
}

const SUIT_SYMBOLS: Record<string, { symbol: string; color: string }> = {
  "♠": { symbol: "♠", color: "text-gray-900" },
  "♥": { symbol: "♥", color: "text-red-600" },
  "♦": { symbol: "♦", color: "text-red-600" },
  "♣": { symbol: "♣", color: "text-gray-900" },
};

const SIZES = {
  sm: { card: "w-10 h-14", rank: "text-xs", suit: "text-[10px]", center: "text-lg" },
  md: { card: "w-14 h-20", rank: "text-sm", suit: "text-xs", center: "text-2xl" },
  lg: { card: "w-20 h-28", rank: "text-lg", suit: "text-sm", center: "text-4xl" },
};

export function PlayingCard({ suit, rank, faceDown = false, size = "md" }: PlayingCardProps) {
  const s = SIZES[size];
  const suitInfo = SUIT_SYMBOLS[suit] || { symbol: suit, color: "text-gray-900" };

  if (faceDown) {
    return (
      <div className={`${s.card} rounded-lg border-2 border-gray-600 bg-gradient-to-br from-blue-800 via-blue-900 to-indigo-900 shadow-lg flex items-center justify-center`}>
        <div className="w-[70%] h-[75%] rounded border border-blue-600/40 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.04)_4px,rgba(255,255,255,0.04)_8px)]" />
      </div>
    );
  }

  return (
    <div className={`${s.card} rounded-lg border-2 border-gray-300 bg-white shadow-lg relative flex flex-col justify-between p-1 select-none`}>
      <div className={`flex flex-col items-start leading-none ${suitInfo.color}`}>
        <span className={`${s.rank} font-bold`}>{rank}</span>
        <span className={s.suit}>{suitInfo.symbol}</span>
      </div>
      <div className={`absolute inset-0 flex items-center justify-center ${suitInfo.color}`}>
        <span className={s.center}>{suitInfo.symbol}</span>
      </div>
      <div className={`flex flex-col items-end leading-none ${suitInfo.color}`}>
        <span className={`${s.suit} rotate-180`}>{suitInfo.symbol}</span>
        <span className={`${s.rank} font-bold rotate-180`}>{rank}</span>
      </div>
    </div>
  );
}

export function CardGroup({ cards, faceDown = false, size = "md" }: {
  cards: { suit: string; rank: string }[];
  faceDown?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <div className="flex gap-1.5">
      {cards.map((card, i) => (
        <PlayingCard key={i} suit={card.suit} rank={card.rank} faceDown={faceDown} size={size} />
      ))}
    </div>
  );
}
