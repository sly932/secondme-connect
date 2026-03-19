"use client";

import { useState, useRef, useCallback } from "react";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
  position?: "top" | "bottom";
}

export function Tooltip({ text, children, position = "top" }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    timeoutRef.current = setTimeout(() => setVisible(false), 100);
  }, []);

  const posClass = position === "top"
    ? "bottom-full mb-2 left-1/2 -translate-x-1/2"
    : "top-full mt-2 left-1/2 -translate-x-1/2";

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div className={`absolute ${posClass} z-50 px-2.5 py-1.5 text-xs font-medium text-white bg-gray-900 dark:bg-zinc-100 dark:text-zinc-900 rounded-lg shadow-lg whitespace-nowrap pointer-events-none animate-fade-in`}>
          {text}
          <div className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-zinc-100 rotate-45 ${position === "top" ? "-bottom-1" : "-top-1"}`} />
        </div>
      )}
    </div>
  );
}
