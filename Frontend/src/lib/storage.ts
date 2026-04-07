import type { AuthTokens } from '../types/api';

const TOKENS_KEY = 'warehouse_ops_tokens';

export const tokenStorage = {
  get(): AuthTokens | null {
    const raw = localStorage.getItem(TOKENS_KEY);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as AuthTokens;
    } catch {
      localStorage.removeItem(TOKENS_KEY);
      return null;
    }
  },
  set(tokens: AuthTokens) {
    localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  },
  clear() {
    localStorage.removeItem(TOKENS_KEY);
  },
};
