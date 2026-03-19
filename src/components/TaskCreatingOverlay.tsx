"use client";

import { useState, useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";

interface TaskCreatingOverlayProps {
  type: "chat" | "writing" | "painting";
  apiDone: boolean;
  error?: string | null;
  /** 完成后显示的摘要信息 */
  summary?: string;
}

export function TaskCreatingOverlay({ type, apiDone, error, summary }: TaskCreatingOverlayProps) {
  const t = useT();

  const STEP_CONFIGS = {
    chat: {
      icon: "💬",
      color: "from-violet-400 to-purple-500",
      shadow: "shadow-violet-500/20",
      doneLabel: t.taskOverlay.chat.doneLabel,
      steps: t.taskOverlay.chat.steps.map((label: string, i: number) => ({
        label,
        duration: [1000, 1200, 800, 600][i],
      })),
    },
    writing: {
      icon: "✍️",
      color: "from-amber-400 to-orange-500",
      shadow: "shadow-amber-500/20",
      doneLabel: t.taskOverlay.writing.doneLabel,
      steps: t.taskOverlay.writing.steps.map((label: string, i: number) => ({
        label,
        duration: [1000, 1200, 800, 600][i],
      })),
    },
    painting: {
      icon: "🎨",
      color: "from-pink-400 to-rose-500",
      shadow: "shadow-pink-500/20",
      doneLabel: t.taskOverlay.painting.doneLabel,
      steps: t.taskOverlay.painting.steps.map((label: string, i: number) => ({
        label,
        duration: [1000, 1200, 800, 600][i],
      })),
    },
  };

  const config = STEP_CONFIGS[type];
  const STEPS = config.steps;
  const TOTAL_FAKE_DURATION = STEPS.reduce((s, step) => s + step.duration, 0);

  const [stepIndex, setStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    startTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - (startTimeRef.current ?? Date.now());

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
  }, [apiDone, error, STEPS, TOTAL_FAKE_DURATION]);

  const currentLabel = error
    ? t.taskOverlay.failed
    : apiDone
    ? config.doneLabel
    : STEPS[stepIndex].label;

  return (
    <div className="flex flex-col items-center py-6 space-y-6">
      {/* 图标动画 */}
      <div className="relative">
        <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${config.color} flex items-center justify-center text-3xl animate-pulse shadow-lg ${config.shadow}`}>
          {config.icon}
        </div>
        {!error && !apiDone && (
          <div className={`absolute inset-0 w-20 h-20 rounded-full border-2 border-current opacity-30 animate-ping`} style={{ borderColor: 'currentColor' }} />
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
        {apiDone && !error && summary && (
          <p className="text-xs text-gray-500 dark:text-zinc-400">{summary}</p>
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
                : `bg-gradient-to-r ${config.color}`
            }`}
            style={{ width: `${error ? progress : Math.round(progress)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[11px] text-gray-400 dark:text-zinc-500">
            {error ? t.taskOverlay.error : `${Math.round(progress)}%`}
          </span>
        </div>
      </div>

      {/* 步骤指示器 */}
      {!error && (
        <div className="flex items-center gap-2">
          {STEPS.map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full transition-all duration-300 ${
                i < stepIndex
                  ? "bg-green-500"
                  : i === stepIndex && !apiDone
                  ? "bg-current animate-pulse scale-125"
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
