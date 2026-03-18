"use client";

import { useEffect, useRef, useState } from "react";

const CARD_SET = [
  {
    id: "matching",
    color: "from-fuchsia-600 via-violet-600 to-indigo-700",
    eyebrow: "AGENT LAYER",
    label: "AI Agent Matching",
    description: "Route every incoming request to the right SecondMe identity in real time.",
    metric: "Live routing",
  },
  {
    id: "execution",
    color: "from-sky-500 via-cyan-500 to-teal-600",
    eyebrow: "TASK FLOW",
    label: "Smart Task Execution",
    description: "Turn conversations into deliverables with automated execution and follow-through.",
    metric: "Auto execute",
  },
  {
    id: "credits",
    color: "from-emerald-500 via-green-500 to-lime-600",
    eyebrow: "VALUE LOOP",
    label: "Credit Economy",
    description: "Keep incentives aligned with a visible credit layer across the agent network.",
    metric: "Credit sync",
  },
];

export function ImageCarousel() {
  const cards = [...CARD_SET, ...CARD_SET];
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pausedRef = useRef(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let animationId: number;
    const speed = 0.45;

    function animate() {
      const loopWidth = el.scrollWidth / 2;

      if (!pausedRef.current && loopWidth > 0) {
        let nextPosition = el.scrollLeft + speed;

        if (nextPosition >= loopWidth) {
          nextPosition -= loopWidth;
        }

        el.scrollLeft = nextPosition;
      }
      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, []);

  function centerCard(index: number) {
    const container = scrollRef.current;
    const slot = slotRefs.current[index];
    if (!container || !slot) return;

    const maxScroll = container.scrollWidth - container.clientWidth;
    const target = Math.max(
      0,
      Math.min(
        slot.offsetLeft - (container.clientWidth - slot.offsetWidth) / 2,
        maxScroll,
      ),
    );

    container.scrollTo({
      left: target,
      behavior: "smooth",
    });
  }

  function normalizeScrollPosition() {
    const container = scrollRef.current;
    if (!container) return;

    const loopWidth = container.scrollWidth / 2;
    if (loopWidth > 0 && container.scrollLeft >= loopWidth) {
      container.scrollLeft -= loopWidth;
    }
  }

  return (
    <div className="relative w-full py-6 md:py-10">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-black via-black/80 to-transparent md:w-20" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-black via-black/80 to-transparent md:w-20" />

      <div
        ref={scrollRef}
        className="overflow-hidden px-2 py-4 md:px-4"
        onMouseLeave={() => {
          normalizeScrollPosition();
          pausedRef.current = false;
          setHoveredIndex(null);
        }}
      >
        <div className="flex w-max items-center gap-4 md:gap-6">
          {cards.map((img, index) => {
            const isActive = hoveredIndex === index;
            const isInactive = hoveredIndex !== null && hoveredIndex !== index;

            return (
              <div
                key={`${img.id}-${index}`}
                ref={(node) => {
                  slotRefs.current[index] = node;
                }}
                className="relative h-56 w-[19rem] shrink-0 md:h-64 md:w-[23rem]"
                onMouseEnter={() => {
                  pausedRef.current = true;
                  setHoveredIndex(index);
                  centerCard(index);
                }}
              >
                <div
                  className={[
                    "pointer-events-none relative h-full overflow-hidden rounded-[28px] border border-white/12",
                    `bg-gradient-to-br ${img.color}`,
                    "transform-gpu transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    "shadow-[0_18px_45px_rgba(0,0,0,0.34)]",
                    isActive && "z-20 -translate-y-4 scale-[1.12] shadow-[0_30px_90px_rgba(0,0,0,0.5)]",
                    isInactive && "scale-[0.9] opacity-55 saturate-75 brightness-75",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_34%)]" />
                  <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.18),transparent_38%,rgba(8,8,8,0.28)_100%)]" />
                  <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:24px_24px]" />

                  <div className="relative flex h-full flex-col justify-between p-6 md:p-7">
                    <div className="flex items-start justify-between gap-4">
                      <span className="rounded-full border border-white/20 bg-black/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.32em] text-white/75 backdrop-blur-sm">
                        {img.eyebrow}
                      </span>
                      <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/70 backdrop-blur-sm">
                        {img.metric}
                      </span>
                    </div>

                    <div className="space-y-3">
                      <p className="max-w-[15rem] text-sm leading-6 text-white/75 md:text-[15px]">
                        {img.description}
                      </p>
                      <div className="flex items-end justify-between gap-4">
                        <span className="max-w-[14rem] text-2xl font-semibold tracking-tight text-white md:text-[1.75rem]">
                          {img.label}
                        </span>
                        <span className="h-3 w-3 rounded-full bg-white/80 shadow-[0_0_24px_rgba(255,255,255,0.8)]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
