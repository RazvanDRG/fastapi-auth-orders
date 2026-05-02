export type Role = 'admin' | 'operator' | 'service';

export type User = {
  id: number;
  email: string;
  role: Role;
  first_name: string | null;
  last_name: string | null;
};

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
};

export type AuthTokens = TokenResponse;

export type RegisterPayload = {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type ForgotPasswordPayload = {
  email: string;
};

export type ResetPasswordPayload = {
  email: string;
  code: string;
  new_password: string;
  confirm_password: string;
};

export type OrderStatus =
  | 'NEW'
  | 'RESERVED'
  | 'PICKING'
  | 'PICKED'
  | 'SHIPPED'
  | 'CANCELLED'
  | 'FAILED_RESERVATION';

export type OrderItemCreate = {
  product_id: number;
  qty: number;
};

export type OrderCreatePayload = {
  customer_id: number;
  reference?: string;
  items: OrderItemCreate[];
};

export type Product = {
  id: number;
  name: string;
  sku: string;
  stock_qty: number;
};

export type OrderItem = {
  product_id: number;
  qty: number;
  product_name?: string;
};

export type Order = {
  id: number;
  customer_id: number;
  reference?: string;
  status: string;
  items: OrderItem[];
};

export type MessageResponse = {
  message: string;
};

export type OpsLiveResponse = {
  status: string;
  app: string;
};

export type OpsReadyResponse = {
  status: string;
  db: string;
};

export type RoleUpdatePayload = {
  role: Role;
};

export type ApiErrorResponse = {
  detail?: string | { msg?: string }[];
  request_id?: string;
};

export type RequestMeta = {
  requestId?: string;
};
