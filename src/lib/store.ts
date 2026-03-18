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

interface DialogState {
  isOpen: boolean;
  activeTab: "consult" | "marketplace";
  open: (tab?: "consult" | "marketplace") => void;
  close: () => void;
  setTab: (tab: "consult" | "marketplace") => void;
}

export const useDialogStore = create<DialogState>((set) => ({
  isOpen: false,
  activeTab: "consult",
  open: (tab = "consult") => set({ isOpen: true, activeTab: tab }),
  close: () => set({ isOpen: false }),
  setTab: (tab) => set({ activeTab: tab }),
}));
