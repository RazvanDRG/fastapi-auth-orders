import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { tokenStorage } from './storage';
import { generateRequestId } from './utils';
import type { AuthTokens, TokenResponse } from '../types/api';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

export const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let refreshPromise: Promise<AuthTokens | null> | null = null;

function attachAuth(config: InternalAxiosRequestConfig) {
  const tokens = tokenStorage.get();
  const requestId = generateRequestId();

  config.headers.set('X-Request-ID', requestId);

  if (tokens?.access_token) {
    config.headers.set('Authorization', `Bearer ${tokens.access_token}`);
  }

  return config;
}

http.interceptors.request.use(attachAuth);

async function refreshTokens(): Promise<AuthTokens | null> {
  const tokens = tokenStorage.get();
  if (!tokens?.refresh_token) return null;

  const response = await axios.post<TokenResponse>(`${API_BASE_URL}/auth/refresh`, {
    refresh_token: tokens.refresh_token,
  });

  tokenStorage.set(response.data);
  return response.data;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || originalRequest?._retry) {
      return Promise.reject(error);
    }

    const isAuthRoute = originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh');
    if (isAuthRoute) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = refreshTokens()
        .catch(() => {
          tokenStorage.clear();
          return null;
        })
        .finally(() => {
          isRefreshing = false;
        });
    }

    const refreshed = await refreshPromise;
    if (!refreshed?.access_token) {
      return Promise.reject(error);
    }

    originalRequest.headers.set('Authorization', `Bearer ${refreshed.access_token}`);
    return http(originalRequest);
  },
);
