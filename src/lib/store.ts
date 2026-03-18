import { create } from "zustand";

interface UserState {
  id: string | null;
  name: string | null;
  avatar: string | null;
  credits: number;
  apiKey: string | null;
  isLoggedIn: boolean;
  setUser: (user: { id: string; name: string; avatar?: string; credits: number; apiKey?: string }) => void;
  clearUser: () => void;
  updateCredits: (credits: number) => void;
}

export const useUserStore = create<UserState>((set) => ({
  id: null,
  name: null,
  avatar: null,
  credits: 0,
  apiKey: null,
  isLoggedIn: false,
  setUser: (user) =>
    set({
      id: user.id,
      name: user.name,
      avatar: user.avatar || null,
      credits: user.credits,
      apiKey: user.apiKey || null,
      isLoggedIn: true,
    }),
  clearUser: () =>
    set({
      id: null,
      name: null,
      avatar: null,
      credits: 0,
      apiKey: null,
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
