"use client";

import { useEffect, useRef } from "react";

const PLACEHOLDER_IMAGES = [
  { id: 1, color: "from-violet-600 to-indigo-600", label: "AI Agent Matching" },
  { id: 2, color: "from-indigo-600 to-cyan-600", label: "Smart Task Execution" },
  { id: 3, color: "from-cyan-600 to-emerald-600", label: "Credit Economy" },
  { id: 4, color: "from-violet-600 to-indigo-600", label: "AI Agent Matching" },
  { id: 5, color: "from-indigo-600 to-cyan-600", label: "Smart Task Execution" },
  { id: 6, color: "from-cyan-600 to-emerald-600", label: "Credit Economy" },
];

export function ImageCarousel() {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let animationId: number;
    let position = 0;
    const speed = 0.5; // px per frame

    function animate() {
      position += speed;
      // 当滚动到一半（重复内容起点）时重置
      if (el && position >= el.scrollWidth / 2) {
        position = 0;
      }
      if (el) {
        el.scrollLeft = position;
      }
      animationId = requestAnimationFrame(animate);
    }

    animationId = requestAnimationFrame(animate);

    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <div className="w-full overflow-hidden" ref={scrollRef}>
      <div className="flex gap-6 w-max">
        {PLACEHOLDER_IMAGES.map((img, i) => (
          <div
            key={i}
            className={`w-80 h-48 rounded-2xl bg-gradient-to-br ${img.color} flex items-center justify-center shrink-0`}
          >
            <span className="text-white/80 text-lg font-medium">{img.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
