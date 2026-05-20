export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  new_password: string;
  confirm_password: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export type Role = "admin" | "operator" | "service";

export interface User {
  id: number;
  email: string;
  role: Role;
  first_name?: string | null;
  last_name?: string | null;
  is_active?: boolean;
  created_at?: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  stock_qty: number;
}

export interface OrderItem {
  product_id: number;
  qty: number;
  product_name?: string | null;
}

export interface Order {
  id: number;
  customer_id: number;
  reference?: string | null;
  status: string;
  archive_due_at?: string | null;
  archived_at?: string | null;
  items: OrderItem[];
  last_activity_at?: string | null;
}

export interface CreateOrderRequest {
  customer_id: number;
  reference?: string | null;
  items: {
    product_id: number;
    qty: number;
  }[];
}

export interface MetricsOverview {
  users_total: number;
  active_users: number;
  admins_total: number;
  operators_total: number;
}

export interface ActivityFeedItem {
  type: "order" | "admin";
  title: string;
  description: string;
  actor_user_id: number | null;
  actor_role: string | null;
  created_at: string;
}

export interface OrderEvent {
  id: number;
  order_id: number;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor_user_id: number | null;
  actor_role: string | null;
  request_id: string | null;
  created_at: string;
}

export type AuthTokens = AuthResponse;
export type TokenResponse = AuthResponse;