import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AuthUser {
  user_id: number;
  role: string;
  nom: string;
  prenom: string;
  magasin_id: number | null;
  magasin_nom: string | null;
  access_token: string;
  refresh_token: string;
}

interface AuthState {
  user: AuthUser | null;
  login: (user: AuthUser) => void;
  logout: () => void;
  updateTokens: (access: string, refresh: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      login: (user) => set({ user }),
      logout: () => set({ user: null }),
      updateTokens: (access, refresh) =>
        set((state) => ({
          user: state.user
            ? { ...state.user, access_token: access, refresh_token: refresh }
            : null,
        })),
    }),
    { name: "reception-auth" }
  )
);
