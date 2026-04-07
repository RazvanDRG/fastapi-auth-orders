import type { ApiErrorResponse, OrderStatus } from '../types/api';

export function generateRequestId() {
  return crypto.randomUUID();
}

export function getErrorMessage(error: unknown) {
  const fallback = 'Something went wrong.';

  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: ApiErrorResponse } }).response;
    const detail = response?.data?.detail;

    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((item) => item.msg).filter(Boolean).join(', ') || fallback;
    }
  }

  if (error instanceof Error) return error.message;
  return fallback;
}

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function formatDisplayName(firstName?: string | null, lastName?: string | null) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  return fullName || 'No profile name set';
}

export const orderStatusMeta: Record<OrderStatus, { label: string; tone: string }> = {
  NEW: { label: 'New', tone: 'neutral' },
  RESERVED: { label: 'Reserved', tone: 'info' },
  PICKING: { label: 'Picking', tone: 'warning' },
  PICKED: { label: 'Picked', tone: 'success' },
  SHIPPED: { label: 'Shipped', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'danger' },
  FAILED_RESERVATION: { label: 'Failed reservation', tone: 'danger' },
};

export function parseMetrics(raw: string) {
  const interesting = [
    'http_requests_total',
    'http_request_duration_seconds_count',
    'http_request_duration_seconds_sum',
    'process_cpu_seconds_total',
    'process_resident_memory_bytes',
  ];

  return raw
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .filter((line) => interesting.some((metric) => line.startsWith(metric)))
    .slice(0, 20)
    .map((line) => {
      const lastSpace = line.lastIndexOf(' ');
      return {
        metric: line.slice(0, lastSpace),
        value: line.slice(lastSpace + 1),
      };
    });
}
