"use client";

import { useState, useEffect, useRef } from "react";

const STEPS = [
  { label: "正在为你匹配玩家", duration: 1200 },
  { label: "正在准备牌桌", duration: 1000 },
  { label: "正在部署筹码", duration: 800 },
  { label: "即将开局", duration: 600 },
];

const TOTAL_FAKE_DURATION = STEPS.reduce((s, step) => s + step.duration, 0);

interface GameCreatingOverlayProps {
  gameLabel: string;
  playerCount: number;
  onDone?: () => void;
  apiDone: boolean;
  error?: string | null;
}

export function GameCreatingOverlay({
  gameLabel,
  playerCount,
  apiDone,
  error,
}: GameCreatingOverlayProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  // 根据时间推进步骤和进度条
  useEffect(() => {
    startTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current ?? Date.now());

      // 计算当前应该在哪一步
      let acc = 0;
      let currentStep = 0;
      for (let i = 0; i < STEPS.length; i++) {
        acc += STEPS[i].duration;
        if (elapsed < acc) {
          currentStep = i;
          break;
        }
        currentStep = i;
      }
      setStepIndex(currentStep);

      // 进度条：假进度最多到 85%，API 完成后跳到 100%
      if (apiDone && !error) {
        setProgress(100);
      } else if (error) {
        // 出错时停住
      } else {
        const fakeProgress = Math.min((elapsed / TOTAL_FAKE_DURATION) * 85, 85);
        setProgress(fakeProgress);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [apiDone, error]);

  const currentLabel = error
    ? "创建失败"
    : apiDone
    ? "准备就绪，正在跳转..."
    : STEPS[stepIndex].label;

  return (
    <div className="flex flex-col items-center py-6 space-y-6">
      {/* 游戏图标动画 */}
      <div className="relative">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-3xl animate-pulse shadow-lg shadow-emerald-500/20">
          {gameLabel === "21点" ? "🃏" : "♠️"}
        </div>
        {!error && !apiDone && (
          <div className="absolute inset-0 w-20 h-20 rounded-full border-2 border-emerald-400/30 animate-ping" />
        )}
        {apiDone && !error && (
          <div className="absolute -right-1 -bottom-1 w-7 h-7 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7L5.5 10L11.5 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        {error && (
          <div className="absolute -right-1 -bottom-1 w-7 h-7 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M4 4L10 10M10 4L4 10" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      {/* 状态文字 */}
      <div className="text-center space-y-1">
        <p className={`text-base font-medium ${error ? "text-red-500 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
          {currentLabel}
        </p>
        {!error && !apiDone && (
          <p className="text-xs text-gray-400 dark:text-zinc-500">
            {gameLabel} · {playerCount} 人对战
          </p>
        )}
        {error && (
          <p className="text-xs text-red-400 dark:text-red-500">{error}</p>
        )}
      </div>

      {/* 进度条 */}
      <div className="w-full max-w-xs">
        <div className="h-1.5 bg-gray-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              error
                ? "bg-red-500"
                : apiDone
                ? "bg-green-500"
                : "bg-gradient-to-r from-emerald-400 to-cyan-500"
            }`}
            style={{ width: `${error ? progress : Math.round(progress)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[11px] text-gray-400 dark:text-zinc-500">
            {error ? "出错了" : `${Math.round(progress)}%`}
          </span>
        </div>
      </div>

      {/* 步骤指示器 */}
      {!error && (
        <div className="flex items-center gap-2">
          {STEPS.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i < stepIndex
                  ? "bg-green-500"
                  : i === stepIndex && !apiDone
                  ? "bg-emerald-400 animate-pulse scale-125"
                  : apiDone
                  ? "bg-green-500"
                  : "bg-gray-300 dark:bg-zinc-700"
              }`} />
              {i < STEPS.length - 1 && (
                <div className={`w-6 h-px transition-colors duration-300 ${
                  i < stepIndex || apiDone ? "bg-green-500" : "bg-gray-300 dark:bg-zinc-700"
                }`} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
