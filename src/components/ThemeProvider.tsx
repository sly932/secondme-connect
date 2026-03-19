"use client";

import { useEffect } from "react";
import { useThemeStore, useFontStore } from "@/lib/store";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((s) => s.theme);
  const hydrate = useFontStore((s) => s.hydrate);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Hydrate font store from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}
