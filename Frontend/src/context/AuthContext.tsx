import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { http } from "../lib/http";
import { tokenStorage } from "../lib/storage";
import type {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  User,
} from "../types/api";

export type AuthContextValue = {
  user: User | null;
  tokens: AuthResponse | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (payload: LoginRequest) => Promise<void>;
  register: (payload: RegisterRequest) => Promise<{ message: string }>;
  forgotPassword: (payload: ForgotPasswordRequest) => Promise<{ message: string }>;
  resetPassword: (payload: ResetPasswordRequest) => Promise<{ message: string }>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<{ message: string; deleted_at?: string }>;
  refreshProfile: () => Promise<User | null>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokens] = useState<AuthResponse | null>(() => tokenStorage.get());
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    const storedTokens = tokenStorage.get();

    if (!storedTokens?.access_token) {
      setUser(null);
      return null;
    }

    const { data } = await http.get<User>("/auth/me");
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

  const login = useCallback(async (payload: LoginRequest) => {
    const { data } = await http.post<AuthResponse>("/auth/login", payload);

    tokenStorage.set(data);
    setTokens(data);

    const { data: profile } = await http.get<User>("/auth/me", {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
      },
    });

    setUser(profile);
  }, []);

  const register = useCallback(async (payload: RegisterRequest) => {
    const { data } = await http.post<{ message: string }>("/auth/register", payload);
    return data;
  }, []);

  const forgotPassword = useCallback(async (payload: ForgotPasswordRequest) => {
    const { data } = await http.post<{ message: string }>("/auth/forgot-password", payload);
    return data;
  }, []);

  const resetPassword = useCallback(async (payload: ResetPasswordRequest) => {
    const { data } = await http.post<{ message: string }>("/auth/reset-password", payload);
    return data;
  }, []);

  const logout = useCallback(async () => {
    const currentTokens = tokenStorage.get();

    try {
      if (currentTokens?.refresh_token) {
        await http.post("/auth/logout", {
          refresh_token: currentTokens.refresh_token,
        });
      }
    } finally {
      tokenStorage.clear();
      setTokens(null);
      setUser(null);
    }
  }, []);

const deleteAccount = useCallback(async (password: string) => {
    const { data } = await http.delete<{ message: string; deleted_at?: string }>(
      "/auth/me",
      { data: { password } }
    );

    tokenStorage.clear();
    setTokens(null);
    setUser(null);

    return data;
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
      deleteAccount,
      refreshProfile,
    }),
    [
      user,
      tokens,
      isLoading,
      login,
      register,
      forgotPassword,
      resetPassword,
      logout,
      deleteAccount,
      refreshProfile,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}