"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export interface CarouselCard {
  id: string;
  image: string;
  label: string;
  description: string;
  onClick?: () => void;
}

export function ImageCarousel({ cards: cardSet }: { cards: CarouselCard[] }) {
  const cards = [...cardSet, ...cardSet];
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pausedRef = useRef(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    let animationId: number;
    const speed = 0.45;

    function animate() {
      const loopWidth = scroller!.scrollWidth / 2;

      if (!pausedRef.current && loopWidth > 0) {
        let next = scroller!.scrollLeft + speed;
        if (next >= loopWidth) next -= loopWidth;
        scroller!.scrollLeft = next;
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

    container.scrollTo({ left: target, behavior: "smooth" });
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
    <div className="relative w-full py-10 md:py-16">
      <div
        ref={scrollRef}
        className="overflow-hidden px-2 pt-6 pb-16 md:px-4 md:pt-8 md:pb-20"
        onMouseLeave={() => {
          normalizeScrollPosition();
          pausedRef.current = false;
          setHoveredIndex(null);
        }}
      >
        <div className="flex w-max items-center gap-4 md:gap-6">
          {cards.map((card, index) => {
            const isActive = hoveredIndex === index;
            const isInactive = hoveredIndex !== null && hoveredIndex !== index;
            const originalIndex = index % cardSet.length;

            return (
              <div
                key={`${card.id}-${index}`}
                ref={(node) => {
                  slotRefs.current[index] = node;
                }}
                className="relative shrink-0 w-[20rem] md:w-[28rem] cursor-pointer"
                style={{ aspectRatio: "16 / 9" }}
                onMouseEnter={() => {
                  pausedRef.current = true;
                  setHoveredIndex(index);
                  centerCard(index);
                }}
                onClick={() => cardSet[originalIndex]?.onClick?.()}
              >
                <div
                  className={[
                    "pointer-events-none relative h-full overflow-hidden rounded-2xl border border-white/10",
                    "transform-gpu transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                    "shadow-[0_18px_45px_rgba(0,0,0,0.34)]",
                    isActive &&
                      "z-20 -translate-y-4 scale-[1.08] shadow-[0_30px_90px_rgba(0,0,0,0.5)]",
                    isInactive && "scale-[0.92] opacity-55 brightness-75",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <Image
                    src={card.image}
                    alt={card.label}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 20rem, 28rem"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

                  <div className="relative flex h-full flex-col justify-end p-5 md:p-6">
                    <p className="text-xs text-white/70 mb-1 leading-relaxed">
                      {card.description}
                    </p>
                    <span className="text-xl md:text-2xl font-semibold tracking-tight text-white">
                      {card.label}
                    </span>
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
