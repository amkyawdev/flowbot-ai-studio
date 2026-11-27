import { create } from 'zustand';
import { authApi } from '@/api/client';

interface User {
  id: string;
  email: string;
  displayName: string;
}

interface Toast {
  id: number;
  message: string;
  kind: 'info' | 'error' | 'success';
}

interface AppState {
  user: User | null;
  token: string | null;
  ready: boolean;
  toasts: Toast[];
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
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
    if (!res || typeof res !== 'object' || !res.token) {
      throw new Error('Login failed: no token returned. Check your connection.');
    }
    localStorage.setItem('flowbot_token', res.token);
    set({ token: res.token, user: res.user });
  },

  async register(email, password, displayName) {
    await authApi.register({ email, password, displayName });
    await get().login(email, password);
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
      const res = await authApi.me() as { user: User };
      set({ user: res.user, ready: true });
    } catch {
      localStorage.removeItem('flowbot_token');
      set({ token: null, user: null, ready: true });
    }
  },
}));