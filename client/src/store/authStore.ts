import { create } from 'zustand';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  plan: 'free' | 'pro';
}

interface AuthState {
  user: AuthUser | null;
  /**
   * Intentionally NOT persisted to localStorage/sessionStorage — kept in
   * memory only to reduce the XSS blast radius. Lost on hard refresh; the
   * app calls POST /auth/refresh (httpOnly cookie) on bootstrap to recover
   * it. See docs/SECURITY.md.
   */
  accessToken: string | null;
  setAuth: (user: AuthUser, accessToken: string) => void;
  setAccessToken: (accessToken: string | null) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setAuth: (user, accessToken) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  clear: () => set({ user: null, accessToken: null }),
}));
