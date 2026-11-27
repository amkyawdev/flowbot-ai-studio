import { create } from 'zustand';
import { authApi } from '@/api/client';
import type { AuthUser } from '@/api/client';

interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}

export interface AuthOutcome {
  otpRequired: boolean;
  email?: string;
  devCode?: string;
  warning?: string;
}

interface AppState {
  user: AuthUser | null;
  token: string | null;
  ready: boolean;
  toasts: Toast[];
  login: (email: string, password: string) => Promise<AuthOutcome>;
  register: (email: string, password: string, displayName?: string) => Promise<AuthOutcome>;
  completeAuth: (token: string, user: AuthUser) => void;
  logout: () => Promise<void>;
  boot: () => Promise<void>;
  toast: (message: string, kind?: 'info' | 'error' | 'success') => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useApp = create<AppState>((set, get) => ({
  user: null,
  token: localStorage.getItem('flowbot_token'),
  ready: false,
  toasts: [],

  toast(message, kind = 'info') {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => get().dismissToast(id), 4200);
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  async login(email, password) {
    const res = await authApi.login({ email, password });
    if (res.otpRequired) {
      return { otpRequired: true, email: res.email || email, devCode: res.devCode };
    }
    if (!res.token || !res.user) {
      throw new Error('Login failed: no token returned. Check your connection.');
    }
    get().completeAuth(res.token, res.user);
    return { otpRequired: false };
  },

  completeAuth(token, user) {
    localStorage.setItem('flowbot_token', token);
    set({ token, user });
  },

  async register(email, password, displayName) {
    const res = await authApi.register({ email, password, displayName });
    if (res.otpRequired) {
      return { otpRequired: true, devCode: res.devCode, warning: res.warning };
    }
    await get().login(email, password);
    return { otpRequired: false, warning: res.warning };
  },

  async logout() {
    try { await authApi.logout(); } catch { /* ignore */ }
    localStorage.removeItem('flowbot_token');
    set({ token: null, user: null });
  },

  async boot() {
    const token = get().token;
    if (!token) {
      set({ ready: true });
      return;
    }
    try {
      const res = await authApi.me() as { user: AuthUser };
      set({ user: res.user, ready: true });
    } catch {
      localStorage.removeItem('flowbot_token');
      set({ token: null, user: null, ready: true });
    }
  },
}));