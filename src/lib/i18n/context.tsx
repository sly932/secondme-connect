"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import zh, { type Translations } from "./zh";
import en from "./en";
import ja from "./ja";
import ko from "./ko";

export type Locale = "zh" | "en" | "ja" | "ko";

const TRANSLATIONS: Record<Locale, Translations> = { zh, en, ja, ko };

const STORAGE_KEY = "locale";

function loadLocale(): Locale {
  if (typeof window === "undefined") return "zh";
  const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored && stored in TRANSLATIONS) return stored;
  return "zh";
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "zh",
  setLocale: () => {},
  t: zh,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLocaleState(loadLocale());
    setHydrated(true);
  }, []);

  const setLocale = useCallback((l: Locale) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLocaleState(l);
    document.documentElement.lang = l === "zh" ? "zh-CN" : l;
  }, []);

  useEffect(() => {
    if (hydrated) {
      document.documentElement.lang = locale === "zh" ? "zh-CN" : locale;
    }
  }, [locale, hydrated]);

  const t = TRANSLATIONS[locale];

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useT(): Translations {
  return useContext(I18nContext).t;
}

export function useLocale() {
  const { locale, setLocale } = useContext(I18nContext);
  return { locale, setLocale };
}
