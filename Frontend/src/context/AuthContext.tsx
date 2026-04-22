import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { http } from '../lib/http';
import { tokenStorage } from '../lib/storage';
import type {
  AuthTokens,
  ForgotPasswordPayload,
  LoginPayload,
  MessageResponse,
  RegisterPayload,
  ResetPasswordPayload,
  TokenResponse,
  User,
} from '../types/api';

export type AuthContextValue = {
  user: User | null;
  tokens: AuthTokens | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<MessageResponse>;
  forgotPassword: (payload: ForgotPasswordPayload) => Promise<MessageResponse>;
  resetPassword: (payload: ResetPasswordPayload) => Promise<MessageResponse>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<User | null>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<AuthTokens | null>(() => tokenStorage.get());
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const storedTokens = tokenStorage.get();
    if (!storedTokens?.access_token) {
      setUser(null);
      return null;
    }

    const { data } = await http.get<User>('/auth/me');
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await refreshProfile();
      } catch {
        tokenStorage.clear();
        setTokens(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, [refreshProfile]);

  const login = useCallback(async (payload: LoginPayload) => {
    const { data } = await http.post<TokenResponse>('/auth/login', payload);
    tokenStorage.set(data);
    setTokens(data);

    const { data: profile } = await http.get<User>('/auth/me', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    setUser(profile);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const { data } = await http.post<MessageResponse>('/auth/register', payload);
    return data;
  }, []);

  const forgotPassword = useCallback(async (payload: ForgotPasswordPayload) => {
    const { data } = await http.post<MessageResponse>('/auth/forgot-password', payload);
    return data;
  }, []);

  const resetPassword = useCallback(async (payload: ResetPasswordPayload) => {
    const { data } = await http.post<MessageResponse>('/auth/reset-password', payload);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const currentTokens = tokenStorage.get();
    try {
      if (currentTokens?.refresh_token) {
        await http.post('/auth/logout', { refresh_token: currentTokens.refresh_token });
      }
    } finally {
      tokenStorage.clear();
      setTokens(null);
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      tokens,
      isAuthenticated: Boolean(tokens?.access_token),
      isLoading,
      login,
      register,
      forgotPassword,
      resetPassword,
      logout,
      refreshProfile,
    }),
    [forgotPassword, isLoading, login, logout, refreshProfile, register, resetPassword, tokens, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}