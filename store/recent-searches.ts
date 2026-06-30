"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface RecentSearchesState {
  items: string[]; // most-recent first
  add: (term: string) => void;
  remove: (term: string) => void;
  clear: () => void;
}

const MAX_RECENT = 8;

export const useRecentSearches = create<RecentSearchesState>()(
  persist(
    (set) => ({
      items: [],
      add: (term) => {
        const t = term.trim();
        if (!t) return;
        set((state) => ({
          items: [
            t,
            ...state.items.filter((i) => i.toLowerCase() !== t.toLowerCase()),
          ].slice(0, MAX_RECENT),
        }));
      },
      remove: (term) =>
        set((state) => ({ items: state.items.filter((i) => i !== term) })),
      clear: () => set({ items: [] }),
    }),
    { name: "aarna-recent-searches" },
  ),
);
