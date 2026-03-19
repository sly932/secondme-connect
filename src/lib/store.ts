import { create } from "zustand";

interface UserState {
  id: string | null;
  name: string | null;
  avatar: string | null;
  credits: number;
  isLoggedIn: boolean;
  setUser: (user: { id: string; name: string; avatar?: string; credits: number }) => void;
  clearUser: () => void;
  updateCredits: (credits: number) => void;
}

export const useUserStore = create<UserState>((set) => ({
  id: null,
  name: null,
  avatar: null,
  credits: 0,
  isLoggedIn: false,
  setUser: (user) =>
    set({
      id: user.id,
      name: user.name,
      avatar: user.avatar || null,
      credits: user.credits,
      isLoggedIn: true,
    }),
  clearUser: () =>
    set({
      id: null,
      name: null,
      avatar: null,
      credits: 0,
      isLoggedIn: false,
    }),
  updateCredits: (credits) => set({ credits }),
}));

export type PanelTab = "chat" | "tasks" | "games";
export type TaskSubType = "WRITING" | "PAINTING";

interface PanelState {
  activeTab: PanelTab;
  taskSubType: TaskSubType;
  setTab: (tab: PanelTab) => void;
  setTaskSubType: (sub: TaskSubType) => void;
  scrollToPanel: () => void;
}

export const usePanelStore = create<PanelState>((set) => ({
  activeTab: "chat",
  taskSubType: "WRITING",
  setTab: (tab) => set({ activeTab: tab }),
  setTaskSubType: (sub) => set({ taskSubType: sub }),
  scrollToPanel: () => {
    const el = document.getElementById("connect-panel");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  },
}));

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (typeof window !== "undefined" && localStorage.getItem("theme") as Theme) || "light",
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    set({ theme });
  },
  toggleTheme: () =>
    set((state) => {
      const next = state.theme === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      return { theme: next };
    }),
}));

export const LOGO_FONTS = [
  { key: "caveat", label: "Caveat", style: "随性手写" },
  { key: "pacifico", label: "Pacifico", style: "饱满圆润" },
  { key: "dancing-script", label: "Dancing Script", style: "优雅流畅" },
  { key: "great-vibes", label: "Great Vibes", style: "花体书法" },
  { key: "sacramento", label: "Sacramento", style: "纤细优雅" },
  { key: "satisfy", label: "Satisfy", style: "复古倾斜" },
  { key: "lobster", label: "Lobster", style: "粗体花体" },
  { key: "alex-brush", label: "Alex Brush", style: "精致手写" },
  { key: "playball", label: "Playball", style: "复古活泼" },
  { key: "kalam", label: "Kalam", style: "圆润温暖" },
] as const;

export type LogoFontKey = typeof LOGO_FONTS[number]["key"];

const FONT_CSS_VARS = [
  "var(--font-caveat)",
  "var(--font-pacifico)",
  "var(--font-dancing-script)",
  "var(--font-great-vibes)",
  "var(--font-sacramento)",
  "var(--font-satisfy)",
  "var(--font-lobster)",
  "var(--font-alex-brush)",
  "var(--font-playball)",
  "var(--font-kalam)",
];

export const LOGO_FONT_CSS: Record<LogoFontKey, string> = {
  caveat: FONT_CSS_VARS[0],
  pacifico: FONT_CSS_VARS[1],
  "dancing-script": FONT_CSS_VARS[2],
  "great-vibes": FONT_CSS_VARS[3],
  sacramento: FONT_CSS_VARS[4],
  satisfy: FONT_CSS_VARS[5],
  lobster: FONT_CSS_VARS[6],
  "alex-brush": FONT_CSS_VARS[7],
  playball: FONT_CSS_VARS[8],
  kalam: FONT_CSS_VARS[9],
};

/** fontIndex → CSS font-family value (out-of-range falls back to 0) */
export function getFontCssByIndex(index: number): string {
  return FONT_CSS_VARS[index] ?? FONT_CSS_VARS[0];
}

/** fontIndex → LogoFontKey (out-of-range falls back to "caveat") */
function indexToKey(index: number): LogoFontKey {
  return LOGO_FONTS[index]?.key ?? LOGO_FONTS[0].key;
}

function keyToIndex(key: LogoFontKey): number {
  const idx = LOGO_FONTS.findIndex((f) => f.key === key);
  return idx >= 0 ? idx : 0;
}

function loadFontIndex(): number {
  if (typeof window === "undefined") return 0;
  const stored = localStorage.getItem("fontIndex");
  if (stored === null) return 0;
  const n = Number(stored);
  return n >= 0 && n < LOGO_FONTS.length ? n : 0;
}

interface FontState {
  fontIndex: number;
  logoFont: LogoFontKey;
  hydrated: boolean;
  hydrate: () => void;
  setFontIndex: (index: number) => void;
  setLogoFont: (font: LogoFontKey) => void;
  /** Call once after login to sync from server */
  syncFromServer: (index: number) => void;
}

export const useFontStore = create<FontState>((set, get) => ({
  // Always start with default to match SSR
  fontIndex: 0,
  logoFont: "caveat",
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    const idx = loadFontIndex();
    set({ fontIndex: idx, logoFont: indexToKey(idx), hydrated: true });
  },

  setFontIndex: (index) => {
    const safeIndex = index >= 0 && index < LOGO_FONTS.length ? index : 0;
    localStorage.setItem("fontIndex", String(safeIndex));
    set({ fontIndex: safeIndex, logoFont: indexToKey(safeIndex) });
    // fire-and-forget save to DB
    fetch("/api/v1/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fontIndex: safeIndex }),
    }).catch(() => {});
  },

  setLogoFont: (font) => {
    const index = keyToIndex(font);
    localStorage.setItem("fontIndex", String(index));
    set({ fontIndex: index, logoFont: font });
    fetch("/api/v1/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fontIndex: index }),
    }).catch(() => {});
  },

  syncFromServer: (index) => {
    const safeIndex = index >= 0 && index < LOGO_FONTS.length ? index : 0;
    localStorage.setItem("fontIndex", String(safeIndex));
    set({ fontIndex: safeIndex, logoFont: indexToKey(safeIndex) });
  },
}));
